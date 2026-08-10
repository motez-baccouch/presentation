/**
 * One-off: correct the live deck to "Ali Harkous" / personKey "harkous",
 * from any earlier misspelling. Idempotent. Run: npx tsx scripts/fix-harkous.ts
 */
import { readFileSync } from "fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const slides = await prisma.slide.findMany({
    where: { personKey: { in: ["hourkous", "harkousa"] } },
  });
  if (!slides.length) {
    console.log("nothing to fix");
    return;
  }
  for (const s of slides) {
    const doc = s.document as { elements: { text?: string }[] };
    for (const el of doc.elements) {
      if (typeof el.text === "string") {
        el.text = el.text.replace(/Hourkous|Harkousa/g, "Harkous");
      }
    }
    await prisma.slide.update({
      where: { id: s.id },
      data: { personKey: "harkous", document: doc as object },
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
