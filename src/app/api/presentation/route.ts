import { NextResponse } from "next/server";
import { getPresentation } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const presentation = await getPresentation();
  return NextResponse.json(presentation);
}
