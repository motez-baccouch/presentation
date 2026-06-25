import { NextResponse } from "next/server";
import { rewriteText } from "@/lib/groq";

export async function POST(req: Request) {
  const { text, instruction } = await req
    .json()
    .catch(() => ({ text: "", instruction: "" }));
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }
  if (typeof instruction !== "string" || !instruction.trim()) {
    return NextResponse.json({ error: "instruction required" }, { status: 400 });
  }
  const result = await rewriteText(text, instruction);
  return NextResponse.json({ text: result });
}
