import { NextResponse } from "next/server";
import { fixGrammar } from "@/lib/groq";

export async function POST(req: Request) {
  const { text } = await req.json().catch(() => ({ text: "" }));
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }
  const fixed = await fixGrammar(text);
  return NextResponse.json({ text: fixed });
}
