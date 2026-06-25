import { NextResponse } from "next/server";
import { reorderSlides } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.orderedIds)) {
    return NextResponse.json({ error: "orderedIds required" }, { status: 400 });
  }
  await reorderSlides(body.orderedIds.map(String));
  return NextResponse.json({ ok: true });
}
