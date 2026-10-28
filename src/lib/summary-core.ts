import { SlideData, SummaryItem, SummaryStatus, TextElement } from "./types";
import { getMember, shortName, TEAM } from "./team";

// Pure summary helpers — no DB / server-only imports, so both the seed and the
// server summary module can use them.

export interface PersonUpdate {
  personKey: string;
  name: string;
  bullets: string[];
}

// Section headings on person slides ("✅ DELIVERED" …) carry the task status.
const SECTION_ICONS: [string, string][] = [
  ["✅", "Delivered"],
  ["👀", "In review"],
  ["🔨", "In progress"],
];

/** A leading "Delivered:" / "In review:" / "In progress:" status tag. */
const STATUS_TAG = /^(delivered|released|in review|in progress)\s*[:\-–—]\s*/i;

/**
 * Pull each person's bullet tasks out of their slide(s) — all pages merged,
 * read from the rendered text so manual edits count. Bullets under a status
 * heading are tagged with it ("Delivered: …") so categorising is reliable.
 */
export function collectUpdates(slides: SlideData[]): PersonUpdate[] {
  const byPerson = new Map<string, string[]>();
  for (const s of slides) {
    if (s.type !== "PERSON" || !s.personKey) continue;
    const list = byPerson.get(s.personKey) ?? [];
    byPerson.set(s.personKey, list);
    const texts = s.document.elements
      .filter((e): e is TextElement => e.type === "text")
      .sort((a, b) => a.y - b.y);
    let section: string | undefined;
    for (const t of texts) {
      const text = (t.text || "").trim();
      if (t.role === "eyebrow") {
        const hit = SECTION_ICONS.find(([icon]) => text.includes(icon));
        if (hit) section = hit[1];
      } else if (t.role === "bullet" && text.length > 1) {
        list.push(section && !STATUS_TAG.test(text) ? `${section}: ${text}` : text);
      }
    }
  }
  return [...byPerson.entries()]
    .map(([personKey, bullets]) => ({
      personKey,
      name: getMember(personKey)?.name ?? personKey,
      bullets,
    }))
    .filter((u) => u.bullets.length);
}

/** Group one status column's items by person, in roster order. */
export function groupByPerson(
  items: SummaryItem[],
  status: SummaryStatus,
): { personKey: string; labels: string[] }[] {
  const rank = (key: string) => {
    const i = TEAM.findIndex((m) => m.key === key);
    return i < 0 ? TEAM.length : i;
  };
  const map = new Map<string, string[]>();
  for (const it of items) {
    if (it.status !== status) continue;
    const list = map.get(it.personKey) ?? [];
    list.push(it.label);
    map.set(it.personKey, list);
  }
  return [...map.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([personKey, labels]) => ({ personKey, labels }));
}

function shorten(input: string, words = 7): string {
  const w = input.replace(/\s+/g, " ").trim().replace(/\.$/, "").split(" ");
  return w.length <= words ? w.join(" ") : w.slice(0, words).join(" ") + "…";
}

function statusFromTag(tag: string): SummaryStatus {
  const t = tag.toLowerCase();
  if (t === "delivered" || t === "released") return "Released";
  if (t === "in review") return "In Review";
  return "In Progress";
}

function classify(input: string): SummaryStatus {
  const t = input.toLowerCase();
  if (/\b(released|delivered|deployed|shipped|merged|production|live)\b/.test(t))
    return "Released";
  if (/\b(review|ready|approval|qa|tested|testing|pr is)\b/.test(t))
    return "In Review";
  return "In Progress";
}

/** Heuristic categorisation used for seeding and as an AI fallback. */
export function naiveCategorize(updates: PersonUpdate[]): SummaryItem[] {
  const items: SummaryItem[] = [];
  for (const u of updates) {
    for (const b of u.bullets) {
      const tag = b.match(STATUS_TAG);
      items.push({
        personKey: u.personKey,
        label: shorten(tag ? b.slice(tag[0].length) : b),
        status: tag ? statusFromTag(tag[1]) : classify(b),
      });
    }
  }
  return items;
}

/** Plain-text recap (for Slack), grouped by status. */
export function summaryToText(items: SummaryItem[]): string {
  const statuses: SummaryStatus[] = ["Released", "In Review", "In Progress"];
  const icon: Record<SummaryStatus, string> = {
    Released: "✅",
    "In Review": "👀",
    "In Progress": "🔨",
  };
  return statuses
    .map((st) => {
      const list = items.filter((i) => i.status === st);
      if (!list.length) return "";
      const lines = list
        .map((i) => {
          const m = getMember(i.personKey);
          return `   • ${i.label}${m ? ` (${shortName(m)})` : ""}`;
        })
        .join("\n");
      return `${icon[st]} *${st}* (${list.length})\n${lines}`;
    })
    .filter(Boolean)
    .join("\n\n");
}
