import { NextResponse } from "next/server";
import { getDeckVersion } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const v = await getDeckVersion();
  return NextResponse.json(
    { v },
    { headers: { "Cache-Control": "no-store" } },
  );
}
