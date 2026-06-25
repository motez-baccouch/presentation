import { NextResponse } from "next/server";
import { duplicateSlide } from "@/lib/db";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const slide = await duplicateSlide(id);
  if (!slide) {
    return NextResponse.json({ error: "Slide not found" }, { status: 404 });
  }
  return NextResponse.json(slide);
}
