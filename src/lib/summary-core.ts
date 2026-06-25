import { SlideData, SummaryItem, SummaryStatus } from "./types";
import { getMember } from "./team";

// Pure summary helpers — no DB / server-only imports, so both the seed and the
// server summary module can use them.

export interface PersonUpdate {
  personKey: string;
  name: string;
  bullets: string[];
}

/** Pull each person's bullet tasks out of their slide. */
export function collectUpdates(slides: SlideData[]): PersonUpdate[] {
  return slides
    .filter((s) => s.type === "PERSON" && s.personKey)
    .map((s) => {
      const bullets = s.document.elements
        .filter((e) => e.type === "text" && e.role === "bullet")
        .map((e) => (e as { text: string }).text)
        .filter((t) => t && t.trim().length > 1);
      const member = getMember(s.personKey!);
      return {
        personKey: s.personKey!,
        name: member?.name ?? s.personKey!,
        bullets,
      };
    })
    .filter((u) => u.bullets.length);
}

function shorten(input: string, words = 7): string {
  const w = input.replace(/\s+/g, " ").trim().replace(/\.$/, "").split(" ");
  return w.length <= words ? w.join(" ") : w.slice(0, words).join(" ") + "…";
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
      items.push({
        personKey: u.personKey,
        label: shorten(b),
        status: classify(b),
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
          return `   • ${i.label}${m ? ` (${m.name.split(" ")[0]})` : ""}`;
        })
        .join("\n");
      return `${icon[st]} *${st}* (${list.length})\n${lines}`;
    })
    .filter(Boolean)
    .join("\n\n");
}
