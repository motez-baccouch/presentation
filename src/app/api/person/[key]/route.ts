import { NextResponse } from "next/server";
import { tidyPersonSlides, rewritePersonSlides } from "@/lib/person";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  try {
    const pages =
      action === "rewrite"
        ? await rewritePersonSlides(key)
        : action === "tidy"
          ? await tidyPersonSlides(key)
          : null;
    if (pages === null) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, pages });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not update the slide.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
