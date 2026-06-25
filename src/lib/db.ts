import "server-only";
import fs from "fs";
import path from "path";
import {
  PresentationData,
  SlideData,
  SlideDocument,
  SlideType,
} from "./types";
import { buildDefaultDeck, DEFAULT_TITLE } from "./seed-data";
import { genId } from "./templates";

// Use Postgres (Neon) when DATABASE_URL is configured; otherwise fall back to
// a local JSON file so the app runs with zero setup during local development.
const USE_PRISMA = !!process.env.DATABASE_URL;

export interface NewSlideInput {
  type: SlideType;
  personKey?: string | null;
  document: SlideDocument;
  afterId?: string | null;
}

// ---------------------------------------------------------------------------
// JSON file store (local dev fallback)
// ---------------------------------------------------------------------------

interface FileShape {
  id: string;
  title: string;
  weekOf: string | null;
  slides: SlideData[];
}

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "deck.json");

function fileSeed(): FileShape {
  return {
    id: genId(),
    title: DEFAULT_TITLE,
    weekOf: "Weekly Update",
    slides: buildDefaultDeck().map((s) => ({
      id: genId(),
      order: s.order,
      type: s.type,
      personKey: s.personKey,
      document: s.document,
    })),
  };
}

function fileRead(): FileShape {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw) as FileShape;
  } catch {
    const seeded = fileSeed();
    fileWrite(seeded);
    return seeded;
  }
}

function fileWrite(data: FileShape) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function renumber(slides: SlideData[]): SlideData[] {
  return slides
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({ ...s, order: i }));
}

// ---------------------------------------------------------------------------
// Public API (backend-agnostic)
// ---------------------------------------------------------------------------

export async function getPresentation(): Promise<PresentationData> {
  if (!USE_PRISMA) {
    const data = fileRead();
    return {
      id: data.id,
      title: data.title,
      weekOf: data.weekOf,
      slides: renumber(data.slides),
    };
  }

  const { prisma } = await import("./prisma");
  let pres = await prisma.presentation.findFirst({
    orderBy: { createdAt: "asc" },
    include: { slides: { orderBy: { order: "asc" } } },
  });

  if (!pres) {
    await prisma.presentation.create({
      data: {
        title: DEFAULT_TITLE,
        weekOf: "Weekly Update",
        slides: {
          create: buildDefaultDeck().map((s) => ({
            order: s.order,
            type: s.type,
            personKey: s.personKey,
            document: s.document as object,
          })),
        },
      },
    });
    pres = await prisma.presentation.findFirst({
      orderBy: { createdAt: "asc" },
      include: { slides: { orderBy: { order: "asc" } } },
    });
  }

  return {
    id: pres!.id,
    title: pres!.title,
    weekOf: pres!.weekOf,
    slides: pres!.slides.map((s) => ({
      id: s.id,
      order: s.order,
      type: s.type as SlideType,
      personKey: s.personKey,
      document: s.document as unknown as SlideDocument,
    })),
  };
}

export async function updateSlideDocument(
  slideId: string,
  document: SlideDocument,
): Promise<void> {
  if (!USE_PRISMA) {
    const data = fileRead();
    const slide = data.slides.find((s) => s.id === slideId);
    if (slide) slide.document = document;
    fileWrite(data);
    return;
  }
  const { prisma } = await import("./prisma");
  await prisma.slide.update({
    where: { id: slideId },
    data: { document: document as object },
  });
}

export async function createSlide(input: NewSlideInput): Promise<SlideData> {
  const pres = await getPresentation();
  const afterIndex = input.afterId
    ? pres.slides.findIndex((s) => s.id === input.afterId)
    : pres.slides.length - 1;
  const insertAt = afterIndex + 1;

  if (!USE_PRISMA) {
    const data = fileRead();
    const newSlide: SlideData = {
      id: genId(),
      order: insertAt,
      type: input.type,
      personKey: input.personKey ?? null,
      document: input.document,
    };
    data.slides.forEach((s) => {
      if (s.order >= insertAt) s.order += 1;
    });
    data.slides.push(newSlide);
    fileWrite({ ...data, slides: renumber(data.slides) });
    return newSlide;
  }

  const { prisma } = await import("./prisma");
  const presId = pres.id;
  await prisma.slide.updateMany({
    where: { presentationId: presId, order: { gte: insertAt } },
    data: { order: { increment: 1 } },
  });
  const created = await prisma.slide.create({
    data: {
      presentationId: presId,
      order: insertAt,
      type: input.type,
      personKey: input.personKey ?? null,
      document: input.document as object,
    },
  });
  return {
    id: created.id,
    order: created.order,
    type: created.type as SlideType,
    personKey: created.personKey,
    document: created.document as unknown as SlideDocument,
  };
}

export async function duplicateSlide(slideId: string): Promise<SlideData | null> {
  const pres = await getPresentation();
  const original = pres.slides.find((s) => s.id === slideId);
  if (!original) return null;
  return createSlide({
    type: original.type === "PERSON" ? "CUSTOM" : original.type,
    personKey: null,
    document: JSON.parse(JSON.stringify(original.document)),
    afterId: slideId,
  });
}

export async function deleteSlide(slideId: string): Promise<void> {
  if (!USE_PRISMA) {
    const data = fileRead();
    data.slides = renumber(data.slides.filter((s) => s.id !== slideId));
    fileWrite(data);
    return;
  }
  const { prisma } = await import("./prisma");
  await prisma.slide.delete({ where: { id: slideId } });
  const pres = await getPresentation();
  // re-pack orders
  await Promise.all(
    pres.slides.map((s, i) =>
      s.order === i
        ? Promise.resolve()
        : import("./prisma").then(({ prisma }) =>
            prisma.slide.update({ where: { id: s.id }, data: { order: i } }),
          ),
    ),
  );
}

export async function reorderSlides(orderedIds: string[]): Promise<void> {
  if (!USE_PRISMA) {
    const data = fileRead();
    const map = new Map(data.slides.map((s) => [s.id, s]));
    const next: SlideData[] = [];
    orderedIds.forEach((id, i) => {
      const s = map.get(id);
      if (s) next.push({ ...s, order: i });
    });
    fileWrite({ ...data, slides: next });
    return;
  }
  const { prisma } = await import("./prisma");
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.slide.update({ where: { id }, data: { order: i } }),
    ),
  );
}

/** Create or update the single AI status-board summary slide (before thank-you). */
export async function upsertSummarySlide(
  document: SlideDocument,
): Promise<SlideData> {
  const pres = await getPresentation();
  const existing = pres.slides.find((s) => s.type === "SUMMARY");
  if (existing) {
    await updateSlideDocument(existing.id, document);
    return { ...existing, document };
  }
  const thankYou = pres.slides.find((s) => s.type === "THANKYOU");
  const afterId = thankYou
    ? pres.slides[pres.slides.indexOf(thankYou) - 1]?.id ?? null
    : pres.slides[pres.slides.length - 1]?.id ?? null;
  return createSlide({ type: "SUMMARY", personKey: null, document, afterId });
}

/**
 * Slack flow: create/update a person's slide(s) by roster key, supporting
 * multi-page updates. Existing pages are updated in place; extras are inserted
 * right after, and surplus old pages are removed. Returns the first page.
 */
export async function upsertPersonSlides(
  personKey: string,
  documents: SlideDocument[],
): Promise<SlideData> {
  const pres = await getPresentation();
  const existing = pres.slides
    .filter((s) => s.type === "PERSON" && s.personKey === personKey)
    .sort((a, b) => a.order - b.order);

  // Where to anchor brand-new pages: keep person slides grouped before the
  // SUMMARY/THANKYOU block.
  const boundary =
    pres.slides.find((s) => s.type === "SUMMARY") ??
    pres.slides.find((s) => s.type === "THANKYOU");
  const boundaryAnchor = boundary
    ? pres.slides[pres.slides.indexOf(boundary) - 1]?.id ?? null
    : pres.slides[pres.slides.length - 1]?.id ?? null;

  let first: SlideData | null = null;
  let anchorId = existing.length
    ? existing[existing.length - 1].id
    : boundaryAnchor;

  for (let i = 0; i < documents.length; i++) {
    if (i < existing.length) {
      await updateSlideDocument(existing[i].id, documents[i]);
      if (i === 0) first = { ...existing[i], document: documents[i] };
    } else {
      const created = await createSlide({
        type: "PERSON",
        personKey,
        document: documents[i],
        afterId: anchorId,
      });
      anchorId = created.id;
      if (i === 0) first = created;
    }
  }

  // remove surplus old pages
  for (let i = documents.length; i < existing.length; i++) {
    await deleteSlide(existing[i].id);
  }

  return first ?? (await getPresentation()).slides[0];
}

/** Single-document convenience. */
export async function upsertPersonSlide(
  personKey: string,
  document: SlideDocument,
): Promise<SlideData> {
  return upsertPersonSlides(personKey, [document]);
}
