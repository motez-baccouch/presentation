import "server-only";
import { SlideData, SlideDocument, SlideTask } from "./types";
import { getMember, TeamMember } from "./team";
import { getPresentation, upsertPersonSlides } from "./db";
import { buildPersonSlides } from "./templates";
import { formatCategorized, formatUpdate, CategoryInput } from "./groq";

const SECTIONS = ["Delivered", "In review", "In progress"] as const;

// Recover the section bucket from a rendered heading like "✅ DELIVERED".
function sectionFromHeading(text: string): string | null {
  if (text.includes("✅")) return "Delivered";
  if (text.includes("👀")) return "In review";
  if (text.includes("🔨")) return "In progress";
  return null;
}

/** Best-effort reconstruction of tasks from a rendered (pre-meta) person slide. */
function parseTasksFromDoc(doc: SlideDocument): {
  role?: string;
  tasks: SlideTask[];
} {
  let role: string | undefined;
  let section: string | undefined;
  const tasks: SlideTask[] = [];
  const texts = doc.elements
    .filter((e) => e.type === "text")
    .map((e) => e as { role: string; text: string; y: number })
    .sort((a, b) => a.y - b.y);
  for (const el of texts) {
    const t = (el.text || "").trim();
    if (!t) continue;
    if (el.role === "role") {
      role ??= t;
    } else if (el.role === "eyebrow") {
      const sec = sectionFromHeading(t);
      if (sec) section = sec;
    } else if (el.role === "bullet") {
      tasks.push({ title: t, section, points: [] });
    } else if (el.role === "body" && tasks.length) {
      const cur = tasks[tasks.length - 1];
      if (/^[•◦]/.test(t)) (cur.points ??= []).push(t.replace(/^[•◦]\s*/, ""));
      else cur.detail = t;
    }
  }
  return { role, tasks };
}

/** Gather a member's role + all tasks across their (ordered) person slides. */
function collectPersonInput(
  slides: SlideData[],
  key: string,
): { role?: string; eyebrow?: string; tasks: SlideTask[] } {
  const pages = slides
    .filter((s) => s.type === "PERSON" && s.personKey === key)
    .sort((a, b) => a.order - b.order);
  let role: string | undefined;
  let eyebrow: string | undefined;
  const tasks: SlideTask[] = [];
  for (const p of pages) {
    const meta = p.document.person;
    if (meta?.tasks?.length) {
      role ??= meta.role;
      eyebrow ??= meta.eyebrow;
      tasks.push(...meta.tasks);
    } else {
      const parsed = parseTasksFromDoc(p.document);
      role ??= parsed.role;
      tasks.push(...parsed.tasks);
    }
  }
  return { role, eyebrow, tasks };
}

/** Group tasks back into the three Delivered/In review/In progress text boxes. */
function tasksToCats(tasks: SlideTask[]): CategoryInput {
  const buckets: Record<string, string[]> = {
    Delivered: [],
    "In review": [],
    "In progress": [],
  };
  for (const t of tasks) {
    const sec =
      t.section && (SECTIONS as readonly string[]).includes(t.section)
        ? t.section
        : "In progress";
    const line = [t.title, t.detail, ...(t.points ?? [])]
      .filter(Boolean)
      .join(". ");
    if (line) buckets[sec].push(line);
  }
  return {
    delivered: buckets.Delivered.join("\n"),
    inReview: buckets["In review"].join("\n"),
    inProgress: buckets["In progress"].join("\n"),
  };
}

async function rebuild(
  member: TeamMember,
  data: { role?: string; eyebrow?: string; tasks: SlideTask[] },
): Promise<number> {
  const documents = buildPersonSlides(member, data);
  await upsertPersonSlides(member.key, documents);
  return documents.length;
}

/** Re-paginate a member's slides with the current layout (no AI). */
export async function tidyPersonSlides(key: string): Promise<number> {
  const member = getMember(key);
  if (!member) throw new Error("unknown member");
  const deck = await getPresentation();
  const input = collectPersonInput(deck.slides, key);
  if (!input.tasks.length) throw new Error("no tasks to tidy");
  return rebuild(member, input);
}

/** Re-run the AI rewrite on a member's current content, then re-paginate. */
export async function rewritePersonSlides(key: string): Promise<number> {
  const member = getMember(key);
  if (!member) throw new Error("unknown member");
  const deck = await getPresentation();
  const input = collectPersonInput(deck.slides, key);
  if (!input.tasks.length) throw new Error("no tasks to rewrite");

  const hasSections = input.tasks.some((t) => t.section);
  let tasks: SlideTask[];
  if (hasSections) {
    tasks = await formatCategorized(member.name, tasksToCats(input.tasks));
  } else {
    const raw = input.tasks
      .map((t) => [t.title, t.detail, ...(t.points ?? [])].filter(Boolean).join(". "))
      .join("\n");
    tasks = (await formatUpdate(member.name, raw)).tasks;
  }
  if (!tasks.length) tasks = input.tasks; // never wipe to a placeholder
  return rebuild(member, { role: input.role, eyebrow: input.eyebrow, tasks });
}
