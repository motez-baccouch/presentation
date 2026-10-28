import { NextResponse } from "next/server";
import { generateSummary } from "@/lib/summary";
import { buildSummarySlides } from "@/lib/templates";
import { upsertSummarySlides } from "@/lib/db";
import { formatToday } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function POST() {
  const items = await generateSummary();
  const documents = buildSummarySlides(items, formatToday());
  const slide = await upsertSummarySlides(documents);
  return NextResponse.json({ slide, count: items.length, pages: documents.length });
}
