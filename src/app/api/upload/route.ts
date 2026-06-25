import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { put } from "@vercel/blob";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const safeName = file.name.replace(/[^a-z0-9.\-_]/gi, "_");
  const key = `uploads/${Date.now()}-${safeName}`;

  // Production: Vercel Blob. Local dev: write into /public/uploads.
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(key, file, {
      access: "public",
      addRandomSuffix: true,
    });
    return NextResponse.json({ url: blob.url });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const dir = path.join(process.cwd(), "public", "uploads");
  fs.mkdirSync(dir, { recursive: true });
  const name = `${Date.now()}-${safeName}`;
  fs.writeFileSync(path.join(dir, name), bytes);
  return NextResponse.json({ url: `/uploads/${name}` });
}
