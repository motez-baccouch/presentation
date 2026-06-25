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

/** Naive fallback used when no GROQ_API_KEY is configured. */
function naiveTasks(raw: string): SlideTask[] {
  return raw
    .split(/\n|(?<=[.!?])\s+|•|^-\s|;\s/gm)
    .map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((l) => l.length > 1)
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
  return raw
    .split(/\n|(?<=[.!?])\s+|•|^-\s|;\s/gm)
    .map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((l) => l.length > 1)
    .slice(0, 8);
}

function coerceTasks(arr: unknown): SlideTask[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((t) => {
      if (typeof t === "string") return { title: t.trim() };
      const o = t as { title?: unknown; detail?: unknown };
      const title = o.title ? String(o.title).trim() : "";
      const detail = o.detail ? String(o.detail).trim() : undefined;
      return title ? { title, detail } : null;
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

  const system = `You are a sharp editor turning a software developer's rough weekly notes into a polished presentation slide for the company "Sigma Lending". Do NOT copy their text verbatim — restructure it.
Return STRICT JSON: {"role": string|null, "eyebrow": string|null, "tasks": [{"title": string, "detail": string}]}

Rules for "tasks":
- Identify each DISTINCT piece of work and make it one task. Merge fragments that belong together; split things that don't.
- "title": a short, punchy headline you write yourself (3-6 words, Title Case), even if the person didn't give one. E.g. "Open Banking PR", "Plaid Connection Fix", "Creditsafe Dedupe".
- "detail": one clean, well-written sentence describing it. Fix spelling/grammar; keep technical terms, product names, and numbers exactly (Plaid, Creditsafe, VRP, CCJ, £7,500). If the note is only a couple of words, you may omit detail (empty string).
- 1-8 tasks, ordered most important first.
"role": a short role line ONLY if clearly stated (e.g. "the open banking guy"), else null. "eyebrow": a short status label ONLY if clearly implied (e.g. "Our Newest Team Member"), else null.
Return ONLY the JSON object.`;

  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.35,
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

/**
 * Turn the three modal boxes (Delivered / In Review / In Progress) into clean
 * title/detail tasks, each title prefixed with its status so both the slide and
 * the summary board read correctly.
 */
export async function formatCategorized(
  name: string,
  cats: CategoryInput,
): Promise<SlideTask[]> {
  const sections: [string, string][] = [
    ["Delivered", cats.delivered ?? ""],
    ["In review", cats.inReview ?? ""],
    ["In progress", cats.inProgress ?? ""],
  ].filter(([, v]) => v && v.trim()) as [string, string][];
  if (!sections.length) return [];

  const naive = (): SlideTask[] => {
    const out: SlideTask[] = [];
    for (const [label, txt] of sections) {
      for (const b of naiveBullets(txt)) out.push({ title: `${label}: ${b}` });
    }
    return out;
  };

  const groq = client();
  if (!groq) return naive();

  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You turn ${name}'s rough weekly notes into polished slide tasks for "Sigma Lending". You receive up to three buckets: "Delivered", "In review", "In progress". Do NOT copy text verbatim — restructure it.
Return STRICT JSON: {"tasks": [{"title": string, "detail": string}]}.
For each distinct piece of work:
- "title": a short headline YOU write (3-6 words, Title Case), PREFIXED with its bucket, e.g. "Delivered: Video Call Template" or "In review: Broker Commissions".
- "detail": one clean sentence describing it; fix grammar, keep technical terms, product names, and numbers (Plaid, Creditsafe, VRP, CCJ, £7,500). Omit (empty string) if the note is just a couple of words.
- Order: Delivered first, then In review, then In progress. 1-8 tasks total.
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
