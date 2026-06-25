import { NextResponse } from "next/server";
import { generateSummary } from "@/lib/summary";
import { buildSummarySlide } from "@/lib/templates";
import { upsertSummarySlide } from "@/lib/db";
import { formatToday } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function POST() {
  const items = await generateSummary();
  const document = buildSummarySlide(items, formatToday());
  const slide = await upsertSummarySlide(document);
  return NextResponse.json({ slide, count: items.length });
}
