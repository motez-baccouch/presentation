import { NextResponse } from "next/server";
import { updateSlideDocument, deleteSlide } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (!body.document) {
    return NextResponse.json({ error: "Missing document" }, { status: 400 });
  }
  await updateSlideDocument(id, body.document);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await deleteSlide(id);
  return NextResponse.json({ ok: true });
}
