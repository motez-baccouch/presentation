import Groq from "groq-sdk";
import { SlideTask, SummaryItem, SummaryStatus } from "./types";

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const STATUSES: SummaryStatus[] = ["In Progress", "In Review", "Released"];

function client(): Groq | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  return new Groq({ apiKey });
}

export interface FormattedUpdate {
  role: string | null;
  eyebrow: string | null;
  tasks: SlideTask[];
}

// Lines that are obviously code-host UI chrome (from pasting a GitHub/GitLab PR
// page) rather than real work notes. Dropped from the no-AI split so a pasted
// PR doesn't turn into junk bullets like "#1502", "Open", "wants to merge…".
function looksLikeNoise(s: string): boolean {
  const t = s.trim();
  if (t.length < 2) return true;
  if (/^#\d+$/.test(t)) return true; // issue/PR number
  if (/^[+-]?[\d,]+\s*(additions?|deletions?|changes?)?$/i.test(t)) return true; // diff stats
  if (/^lines? changed/i.test(t)) return true;
  if (/wants? to merge/i.test(t)) return true;
  if (/^[+-][\d,]+$/.test(t)) return true; // +546 / -150
  if (
    /^(open|closed|merged|draft|conversation|commits?|checks?|files?(\s+changed)?|review required|approved)\s*\(?\d*\)?$/i.test(
      t,
    )
  )
    return true;
  if (/^[\w.-]+\/[\w./-]+$/.test(t) && !/\s/.test(t)) return true; // branch / owner-repo path
  return false;
}

function splitLines(raw: string): string[] {
  return raw
    .split(/\n|(?<=[.!?])\s+|•|^-\s|;\s/gm)
    .map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((l) => l.length > 1 && !looksLikeNoise(l));
}

/** Naive fallback used when no GROQ_API_KEY is configured. */
function naiveTasks(raw: string): SlideTask[] {
  return splitLines(raw)
    .slice(0, 8)
    .map((l) => {
      // use the first few words as a title, the rest as detail
      const words = l.split(" ");
      if (words.length <= 7) return { title: l };
      return { title: words.slice(0, 6).join(" "), detail: l };
    });
}

/** Naive split into plain bullet strings (used by reformatToBullets). */
function naiveBullets(raw: string): string[] {
  return splitLines(raw).slice(0, 8);
}

function coerceTasks(arr: unknown): SlideTask[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((t) => {
      if (typeof t === "string") return { title: t.trim() };
      const o = t as {
        title?: unknown;
        detail?: unknown;
        points?: unknown;
        section?: unknown;
      };
      const title = o.title ? String(o.title).trim() : "";
      const detail = o.detail ? String(o.detail).trim() : undefined;
      const section = o.section ? String(o.section).trim() : undefined;
      const points = Array.isArray(o.points)
        ? o.points
            .map((p) => String(p).trim())
            .filter(Boolean)
            .slice(0, 4) // never more than 4 points per task
        : undefined;
      return title
        ? { title, detail, section, points: points?.length ? points : undefined }
        : null;
    })
    .filter(Boolean) as SlideTask[];
}

/**
 * Turn a teammate's free-text Slack message into a structured slide update.
 * Groq detects the distinct tasks, gives each a short TITLE plus a cleaned
 * detail line, and infers a role only if clearly stated.
 */
export async function formatUpdate(
  name: string,
  raw: string,
): Promise<FormattedUpdate> {
  const groq = client();
  if (!groq) return { role: null, eyebrow: null, tasks: naiveTasks(raw) };

  const system = `You turn a developer's raw weekly notes — often pasted straight from a GitHub/GitLab pull request — into clean, presentation-ready slide tasks for the company "Sigma Lending". REWRITE freely: you do NOT need to keep their exact words. Distil the work into a clear title and tidy points. Your goal is a sharp, easy-to-read slide a non-technical teammate can follow.
IGNORE code-host interface noise: PR/issue numbers (#1502), branch names (feature/...), usernames, "wants to merge N commits into …", "Open"/"Closed", "Conversation/Commits/Checks/Files changed", and "+546 −150" diff counts are NOT work items.
Return STRICT JSON: {"role": string|null, "eyebrow": string|null, "tasks": [{"title": string, "points": string[]}]}

Rules for "tasks":
- Identify each DISTINCT piece of work and make it one task. Merge fragments that belong together; drop trivia.
- "title": a short, punchy headline YOU write (3-6 words, Title Case) naming the task. E.g. "Auto-Reject Unsupported Banks", "Plaid Connection Fix".
- "points": 2-4 clear bullet points summarising WHAT the work does and WHY it matters, rewritten into plain readable language. Keep important product names and numbers (Plaid, Creditsafe, VRP, CCJ, £7,500). One idea per point; clarity over length.
- 1-8 tasks, most important first.
"role": a short role line ONLY if clearly stated (e.g. "the open banking guy"), else null. "eyebrow": a short status label ONLY if clearly implied (e.g. "Our Newest Team Member"), else null.
Return ONLY the JSON object.`;

  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Person: ${name}\n\nRaw notes:\n${raw}` },
      ],
    });
    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ?? "{}",
    ) as { role?: unknown; eyebrow?: unknown; tasks?: unknown };
    const tasks = coerceTasks(parsed.tasks);
    return {
      role: parsed.role ? String(parsed.role) : null,
      eyebrow: parsed.eyebrow ? String(parsed.eyebrow) : null,
      tasks: tasks.length ? tasks : naiveTasks(raw),
    };
  } catch {
    return { role: null, eyebrow: null, tasks: naiveTasks(raw) };
  }
}

export interface CategoryInput {
  delivered?: string;
  inReview?: string;
  inProgress?: string;
}

function categorySections(cats: CategoryInput): [string, string][] {
  return [
    ["Delivered", cats.delivered ?? ""],
    ["In review", cats.inReview ?? ""],
    ["In progress", cats.inProgress ?? ""],
  ].filter(([, v]) => v && v.trim()) as [string, string][];
}

/**
 * No-AI path: keep exactly what the teammate typed, just split into bullets and
 * prefix each with its bucket. Used when "AI assist" is unticked in the modal,
 * and as the fallback when Groq isn't configured.
 */
export function categorizeVerbatim(cats: CategoryInput): SlideTask[] {
  const out: SlideTask[] = [];
  for (const [label, txt] of categorySections(cats)) {
    for (const b of naiveBullets(txt)) out.push({ title: b, section: label });
  }
  return out;
}

/**
 * Turn the three modal boxes (Delivered / In Review / In Progress) into clean
 * title/detail tasks, each title prefixed with its status so both the slide and
 * the summary board read correctly.
 */
export async function formatCategorized(
  name: string,
  cats: CategoryInput,
): Promise<SlideTask[]> {
  const sections = categorySections(cats);
  if (!sections.length) return [];

  const naive = (): SlideTask[] => categorizeVerbatim(cats);

  const groq = client();
  if (!groq) return naive();

  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You turn ${name}'s raw weekly notes — often pasted straight from a GitHub/GitLab pull request — into clean, presentation-ready slide tasks for "Sigma Lending". You receive up to three buckets: "Delivered", "In review", "In progress". REWRITE freely: you do NOT need to keep their exact words. Distil each piece of work into a clear title and tidy points a non-technical teammate can follow.
IGNORE code-host interface noise: PR/issue numbers (#1502), branch names (feature/...), usernames, "wants to merge N commits into …", "Open"/"Closed", "Conversation/Commits/Checks/Files changed", and "+546 −150" diff counts are NOT work items.
Return STRICT JSON: {"tasks": [{"section": string, "title": string, "points": string[]}]}.
For each distinct piece of work:
- "section": EXACTLY one of "Delivered", "In review", "In progress" — the bucket the item came from. (Tasks are grouped under one heading per bucket; never repeat the bucket in the title.)
- "title": a short, punchy headline YOU write (3-6 words, Title Case) naming the task. E.g. "Auto-Reject Unsupported Banks", "Email Preview & Editing". Do NOT prefix it with the bucket.
- "points": 2-4 clear bullet points summarising WHAT the work does and WHY it matters, rewritten into plain readable language. Keep important product names and numbers (Plaid, Creditsafe, VRP, CCJ, £7,500). One idea per point; clarity over length.
- Merge fragments that belong to one task; drop trivia. Order: Delivered, then In review, then In progress. 1-8 tasks total.
Return ONLY the JSON object.`,
        },
        {
          role: "user",
          content: JSON.stringify(Object.fromEntries(sections)),
        },
      ],
    });
    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ?? "{}",
    ) as { tasks?: unknown };
    const tasks = coerceTasks(parsed.tasks);
    return tasks.length ? tasks : naive();
  } catch {
    return naive();
  }
}

/** Fix grammar/spelling of a single text fragment, preserving meaning + terms. */
export async function fixGrammar(text: string): Promise<string> {
  const groq = client();
  if (!groq) return text;
  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Fix spelling, grammar, and punctuation of the user's text. Keep the meaning, tone, technical terms, product names, and numbers exactly. Do not add or remove information. Return ONLY the corrected text with no quotes or commentary.",
        },
        { role: "user", content: text },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() || text;
  } catch {
    return text;
  }
}

/**
 * Categorise the whole team's tasks into a status board (In Progress / In
 * Review / Released) with short labels. Returns null if AI is unavailable so
 * the caller can fall back to a naive heuristic.
 */
export async function aiSummarize(
  updates: { personKey: string; name: string; bullets: string[] }[],
): Promise<SummaryItem[] | null> {
  const groq = client();
  if (!groq) return null;
  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You build a weekly status board for the "Sigma Lending" dev team.
For EACH task across all people, output one item: {"personKey": string, "label": string, "status": string}.
- "status" must be EXACTLY one of: "In Progress", "In Review", "Released". Infer it from wording (delivered/production/merged → Released; in review/addressing review/ready/PR → In Review; otherwise → In Progress).
- "label" is a very short 3-7 word summary of the task in title case, keeping product names (Plaid, Creditsafe, VRP, Open Banking, Postcoder). No trailing period.
- "personKey" must be copied EXACTLY from the input.
Return STRICT JSON: {"items": [...]}. Include every task.`,
        },
        {
          role: "user",
          content: JSON.stringify({ people: updates }),
        },
      ],
    });
    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ?? "{}",
    ) as { items?: { personKey?: string; label?: string; status?: string }[] };
    if (!Array.isArray(parsed.items)) return null;
    const keys = new Set(updates.map((u) => u.personKey));
    const items = parsed.items
      .filter((it) => it.personKey && keys.has(it.personKey) && it.label)
      .map((it) => ({
        personKey: it.personKey as string,
        label: String(it.label),
        status: (STATUSES.includes(it.status as SummaryStatus)
          ? it.status
          : "In Progress") as SummaryStatus,
      }));
    return items.length ? items : null;
  } catch {
    return null;
  }
}

/** Rewrite a slide text fragment following a free-form instruction. */
export async function rewriteText(
  text: string,
  instruction: string,
): Promise<string> {
  const groq = client();
  if (!groq) return text;
  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "You edit a piece of text that lives on a presentation slide for the company \"Sigma Lending\". Apply the user's instruction to their text. Keep it crisp and presentation-appropriate, preserve technical terms, product names, and numbers. Return ONLY the resulting text — no quotes, labels, or commentary.",
        },
        {
          role: "user",
          content: `Instruction: ${instruction}\n\nText:\n${text}`,
        },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() || text;
  } catch {
    return text;
  }
}

/** Turn a blob of text into clean bullet points. */
export async function reformatToBullets(text: string): Promise<string[]> {
  const groq = client();
  if (!groq) return naiveBullets(text);
  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Convert the user\'s text into concise slide bullet points. Fix grammar, keep technical terms and numbers. Return STRICT JSON: {"bullets": string[]}. No leading dashes in items.',
        },
        { role: "user", content: text },
      ],
    });
    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ?? "{}",
    ) as { bullets?: string[] };
    return Array.isArray(parsed.bullets) && parsed.bullets.length
      ? parsed.bullets.map((b) => String(b).trim()).filter(Boolean)
      : naiveBullets(text);
  } catch {
    return naiveBullets(text);
  }
}
