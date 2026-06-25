import "server-only";
import { getPresentation } from "./db";
import { SummaryItem } from "./types";
import { aiSummarize } from "./groq";
import { collectUpdates, naiveCategorize } from "./summary-core";

export { collectUpdates, naiveCategorize, summaryToText } from "./summary-core";
export type { PersonUpdate } from "./summary-core";

/** Build the team status board, AI-categorised when Groq is available. */
export async function generateSummary(): Promise<SummaryItem[]> {
  const deck = await getPresentation();
  const updates = collectUpdates(deck.slides);
  if (!updates.length) return [];
  const ai = await aiSummarize(updates);
  return ai ?? naiveCategorize(updates);
}
