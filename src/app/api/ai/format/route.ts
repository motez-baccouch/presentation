import { NextResponse } from "next/server";
import { reformatToBullets } from "@/lib/groq";

export async function POST(req: Request) {
  const { text } = await req.json().catch(() => ({ text: "" }));
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }
  const bullets = await reformatToBullets(text);
  return NextResponse.json({ bullets });
}
