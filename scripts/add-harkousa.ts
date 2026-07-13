/**
 * One-off: add Ali Harkousa's page to the live deck and drop his avatar onto
 * the title slide. Idempotent — safe to re-run; it skips what already exists
 * and never rebuilds/overwrites existing slides.
 *
 *   npx tsx scripts/add-harkousa.ts
 */
import { readFileSync } from "fs";

// load DATABASE_URL from .env.local before Prisma reads the env
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

import { PrismaClient } from "@prisma/client";
import { buildPersonSlides, genId } from "../src/lib/templates";
import { getMember } from "../src/lib/team";

const KEY = "harkousa";
const SLOT = { x: 1064, y: 528, w: 146 };

const prisma = new PrismaClient();

async function main() {
  const member = getMember(KEY);
  if (!member) throw new Error(`"${KEY}" is not in the roster`);

  const pres = await prisma.presentation.findFirst({
    orderBy: { createdAt: "asc" },
    include: { slides: { orderBy: { order: "asc" } } },
  });
  if (!pres) throw new Error("no presentation found");

  // 1) person page(s) — only if he doesn't have one yet
  const already = pres.slides.some(
    (s) => s.type === "PERSON" && s.personKey === KEY,
  );
  if (already) {
    console.log("• page: already exists, skipping");
  } else {
    const docs = buildPersonSlides(member, {
      eyebrow: "Our Newest Recruit — Reporting for Duty 🫡",
      bullets: [
        "Just enlisted — still locating the coffee machine ☕",
        "Onboarding mission: 60% complete",
        "Real updates incoming next week — stay tuned",
      ],
    });
    const boundary =
      pres.slides.find((s) => s.type === "SUMMARY") ??
      pres.slides.find((s) => s.type === "THANKYOU");
    const at = boundary ? boundary.order : pres.slides.length;
    await prisma.slide.updateMany({
      where: { presentationId: pres.id, order: { gte: at } },
      data: { order: { increment: docs.length } },
    });
    for (let i = 0; i < docs.length; i++) {
      await prisma.slide.create({
        data: {
          presentationId: pres.id,
          order: at + i,
          type: "PERSON",
          personKey: KEY,
          document: docs[i] as object,
        },
      });
    }
    console.log(`• page: added ${docs.length} slide(s)`);
  }

  // 2) title-slide avatar — append only if not already there
  const title = pres.slides.find((s) => s.type === "TITLE");
  if (title) {
    const doc = title.document as {
      elements: { type: string; url?: string }[];
    };
    const has = doc.elements.some(
      (e) => e.type === "image" && e.url === member.avatar,
    );
    if (has) {
      console.log("• title avatar: already present, skipping");
    } else {
      doc.elements.push({
        id: genId(),
        type: "image",
        url: member.avatar,
        x: SLOT.x,
        y: SLOT.y,
        w: SLOT.w,
        h: SLOT.w,
        circle: true,
        shadow: true,
        fit: "cover",
        anim: "pop",
        z: 4,
      } as never);
      await prisma.slide.update({
        where: { id: title.id },
        data: { document: doc as object },
      });
      console.log("• title avatar: added");
    }
  }

  console.log("done ✅");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
