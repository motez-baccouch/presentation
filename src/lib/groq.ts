import Groq from "groq-sdk";
import { SummaryItem, SummaryStatus } from "./types";

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
  bullets: string[];
}

/** Naive fallback used when no GROQ_API_KEY is configured. */
function naiveFormat(raw: string): FormattedUpdate {
  const lines = raw
    .split(/\n|(?<=[.!?])\s+|•|^-\s|;\s/gm)
    .map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((l) => l.length > 1);
  return { role: null, eyebrow: null, bullets: lines.slice(0, 8) };
}

/**
 * Turn a teammate's free-text Slack message into a structured slide update.
 * Groq decides what (if anything) is a role/title line vs. actual work bullets,
 * and cleans up grammar/spelling.
 */
export async function formatUpdate(
  name: string,
  raw: string,
): Promise<FormattedUpdate> {
  const groq = client();
  if (!groq) return naiveFormat(raw);

  const system = `You prepare a software developer's weekly update for a single presentation slide for the company "Sigma Lending".
Given the person's name and their raw message, return STRICT JSON with this shape:
{"role": string|null, "eyebrow": string|null, "bullets": string[]}

Rules:
- "bullets": each item is ONE concise, self-contained task the person worked on. Fix spelling and grammar, keep technical terms, product names, and numbers exactly (e.g. Plaid, Creditsafe, VRP, CCJ, £7,500). Do NOT start a bullet with a dash or bullet character. Aim for 1-8 bullets. Merge fragments that belong together; split distinct tasks apart.
- "role": only a short job-title / role line IF the message clearly states one (e.g. "the open banking guy", "ML engineer"). Otherwise null. Do not invent a role.
- "eyebrow": only a short status label IF clearly implied (e.g. "Our Newest Team Member"). Otherwise null.
- Return ONLY the JSON object, nothing else.`;

  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Person: ${name}\n\nRaw message:\n${raw}`,
        },
      ],
    });
    const content = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as Partial<FormattedUpdate>;
    const bullets = Array.isArray(parsed.bullets)
      ? parsed.bullets.map((b) => String(b).trim()).filter(Boolean)
      : [];
    return {
      role: parsed.role ? String(parsed.role) : null,
      eyebrow: parsed.eyebrow ? String(parsed.eyebrow) : null,
      bullets: bullets.length ? bullets : naiveFormat(raw).bullets,
    };
  } catch {
    return naiveFormat(raw);
  }
}

export interface CategoryInput {
  delivered?: string;
  inReview?: string;
  inProgress?: string;
}

/**
 * Turn the three modal boxes (Delivered / In Review / In Progress) into clean
 * slide bullets, each prefixed with its status so both the slide and the
 * summary board read correctly.
 */
export async function formatCategorized(
  name: string,
  cats: CategoryInput,
): Promise<string[]> {
  const sections: [string, string][] = [
    ["Delivered", cats.delivered ?? ""],
    ["In review", cats.inReview ?? ""],
    ["In progress", cats.inProgress ?? ""],
  ].filter(([, v]) => v && v.trim()) as [string, string][];
  if (!sections.length) return [];

  const naive = (): string[] => {
    const out: string[] = [];
    for (const [label, txt] of sections) {
      for (const b of naiveFormat(txt).bullets) out.push(`${label}: ${b}`);
    }
    return out;
  };

  const groq = client();
  if (!groq) return naive();

  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You format ${name}'s weekly dev update into slide bullets for "Sigma Lending".
You receive up to three buckets: "Delivered", "In review", "In progress".
Return STRICT JSON {"bullets": string[]}. For each distinct task output ONE concise bullet:
- fix spelling/grammar, keep technical terms, product names, and numbers exactly (Plaid, Creditsafe, VRP, CCJ, £7,500);
- PREFIX each bullet with its bucket and a colon, e.g. "Delivered: Video call template tab";
- keep the order Delivered, then In review, then In progress;
- no leading dashes or bullet characters.`,
        },
        {
          role: "user",
          content: JSON.stringify(Object.fromEntries(sections)),
        },
      ],
    });
    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ?? "{}",
    ) as { bullets?: string[] };
    return Array.isArray(parsed.bullets) && parsed.bullets.length
      ? parsed.bullets.map((b) => String(b).trim()).filter(Boolean)
      : naive();
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

/** Turn a blob of text into clean bullet points. */
export async function reformatToBullets(text: string): Promise<string[]> {
  const groq = client();
  if (!groq) return naiveFormat(text).bullets;
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
      : naiveFormat(text).bullets;
  } catch {
    return naiveFormat(text).bullets;
  }
}
