/**
 * One-off: correct the spelling on the live deck — "Ali Harkousa" -> "Ali
 * Hourkous", and migrate his personKey "harkousa" -> "hourkous".
 * Idempotent. Run:  npx tsx scripts/fix-hourkous.ts
 */
import { readFileSync } from "fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const slides = await prisma.slide.findMany({ where: { personKey: "harkousa" } });
  if (!slides.length) {
    console.log("no slides with personKey 'harkousa' — nothing to do");
    return;
  }
  for (const s of slides) {
    const doc = s.document as { elements: { text?: string }[] };
    for (const el of doc.elements) {
      if (typeof el.text === "string" && el.text.includes("Harkousa")) {
        el.text = el.text.replace(/Harkousa/g, "Hourkous");
      }
    }
    await prisma.slide.update({
      where: { id: s.id },
      data: { personKey: "hourkous", document: doc as object },
    });
    console.log(`• fixed slide ${s.id}`);
  }
  console.log("done ✅");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
