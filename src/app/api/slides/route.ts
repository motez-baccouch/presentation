import { NextResponse } from "next/server";
import { createSlide } from "@/lib/db";
import { buildBlankSlide } from "@/lib/templates";
import { SlideDocument, SlideType } from "@/lib/types";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const document: SlideDocument = body.document ?? buildBlankSlide();
  const type: SlideType = body.type ?? "CUSTOM";
  const slide = await createSlide({
    type,
    personKey: body.personKey ?? null,
    document,
    afterId: body.afterId ?? null,
  });
  return NextResponse.json(slide);
}
