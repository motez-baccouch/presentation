import {
  SlideDocument,
  SlideElement,
  TextElement,
  ImageElement,
  ShapeElement,
  SlideTask,
  SummaryItem,
  SummaryStatus,
  STAGE_WIDTH,
  STAGE_HEIGHT,
} from "./types";
import { TeamMember, TEAM, getMember, shortName } from "./team";
import { groupByPerson } from "./summary-core";

export function genId(): string {
  // Works in both Node (seed) and the browser (editor).
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2, 11);
}

const DISPLAY = "var(--font-display)";
const SANS = "var(--font-sans)";
const INK = "#1c1407";
const LOGO = "/brand/logo.svg";

function text(partial: Partial<TextElement> & { text: string }): TextElement {
  return {
    id: genId(),
    type: "text",
    x: partial.x ?? 90,
    y: partial.y ?? 90,
    w: partial.w ?? 600,
    text: partial.text,
    role: partial.role ?? "body",
    fontFamily: partial.fontFamily ?? SANS,
    fontSize: partial.fontSize ?? 24,
    fontWeight: partial.fontWeight ?? 400,
    color: partial.color ?? INK,
    align: partial.align ?? "left",
    lineHeight: partial.lineHeight ?? 1.3,
    letterSpacing: partial.letterSpacing,
    italic: partial.italic,
    uppercase: partial.uppercase,
    anim: partial.anim ?? "up",
    z: partial.z ?? 5,
    h: partial.h,
  };
}

function image(partial: Partial<ImageElement> & { url: string }): ImageElement {
  return {
    id: genId(),
    type: "image",
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    w: partial.w ?? 300,
    h: partial.h ?? 300,
    url: partial.url,
    radius: partial.radius,
    shadow: partial.shadow,
    fit: partial.fit ?? "cover",
    circle: partial.circle,
    anim: partial.anim ?? "pop",
    z: partial.z ?? 4,
  };
}

function shape(partial: Partial<ShapeElement> & { kind: ShapeElement["kind"] }): ShapeElement {
  return {
    id: genId(),
    type: "shape",
    kind: partial.kind,
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    w: partial.w ?? 200,
    h: partial.h ?? 200,
    fill: partial.fill ?? "#fbbf09",
    radius: partial.radius,
    rotation: partial.rotation,
    opacity: partial.opacity,
    anim: partial.anim ?? "fade",
    z: partial.z ?? 1,
  };
}

/** Sigma wordmark, sized to the logo's ~2.17:1 aspect ratio. */
function logo(opts: { x: number; y: number; w: number; z?: number }): ImageElement {
  return image({
    url: LOGO,
    x: opts.x,
    y: opts.y,
    w: opts.w,
    h: Math.round(opts.w / 2.17),
    fit: "contain",
    anim: "fade",
    z: opts.z ?? 9,
  });
}

/** Decorative triangle stack in the bottom corner, echoing the Sigma deck. */
function cornerTriangles(): ShapeElement[] {
  return [
    shape({ kind: "triangle", x: STAGE_WIDTH - 150, y: STAGE_HEIGHT - 150, w: 150, h: 150, fill: "#fbbf09", z: 1 }),
    shape({ kind: "triangle", x: STAGE_WIDTH - 95, y: STAGE_HEIGHT - 95, w: 95, h: 95, fill: "#f4691e", z: 2 }),
  ];
}

// Scattered positions for the individual team avatars on the title slide.
const TITLE_AVATAR_SLOTS = [
  { x: 740, y: 96, w: 150 },
  { x: 928, y: 120, w: 168 },
  { x: 1098, y: 188, w: 138 },
  { x: 700, y: 286, w: 152 },
  { x: 884, y: 312, w: 176 },
  { x: 1086, y: 372, w: 150 },
  { x: 832, y: 500, w: 162 },
  { x: 1064, y: 528, w: 146 },
];

export function buildTitleSlide(opts: {
  weekOf?: string;
  dateStr?: string;
}): SlideDocument {
  const avatars: SlideElement[] = TEAM.slice(0, TITLE_AVATAR_SLOTS.length).map(
    (m, i) => {
      const slot = TITLE_AVATAR_SLOTS[i];
      return image({
        url: m.avatar,
        x: slot.x,
        y: slot.y,
        w: slot.w,
        h: slot.w,
        circle: true,
        shadow: true,
        anim: "pop",
        z: 4,
      });
    },
  );

  const elements: SlideElement[] = [
    logo({ x: 96, y: 70, w: 200, z: 9 }),
    shape({ kind: "blob", x: 700, y: 110, w: 560, h: 520, fill: "#fbbf09", opacity: 0.3, z: 1 }),
    ...avatars,
    text({
      text: (opts.dateStr ?? opts.weekOf ?? "Weekly Update").toUpperCase(),
      role: "eyebrow",
      x: 96,
      y: 250,
      w: 620,
      fontFamily: DISPLAY,
      fontSize: 20,
      fontWeight: 700,
      letterSpacing: 5,
      color: "#f4691e",
      uppercase: true,
      anim: "left",
    }),
    text({
      text: "Team Update",
      role: "title",
      x: 92,
      y: 296,
      w: 640,
      fontFamily: DISPLAY,
      fontSize: 110,
      fontWeight: 800,
      lineHeight: 0.98,
      color: INK,
      anim: "up",
    }),
    text({
      text: "Weekly presentation about dev team progress — to making our goals happen.",
      role: "subtitle",
      x: 96,
      y: 500,
      w: 580,
      fontSize: 26,
      fontWeight: 500,
      lineHeight: 1.4,
      color: "#6b5836",
      anim: "up",
    }),
    text({
      text: "Sigma Lending",
      role: "footer",
      x: 96,
      y: 632,
      w: 500,
      fontFamily: DISPLAY,
      fontSize: 24,
      fontWeight: 700,
      color: INK,
      anim: "fade",
    }),
    ...cornerTriangles(),
  ];
  return { background: { kind: "mesh" }, elements };
}

// Split tasks into pages so they never run into the footer. Page 1 has the
// full header (less room); continuation pages have a slim header (more room).
const TITLE_FONT = 23;
const DETAIL_FONT = 17;
const POINT_FONT = 16;
const SECTION_FONT = 16;
const TASK_GAP = 12;
const DETAIL_GAP = 4;
const POINT_GAP = 3;
const POINT_INDENT = 20;
const SECTION_GAP_BEFORE = 10;
const SECTION_GAP_AFTER = 6;
const SECTION_H = SECTION_GAP_BEFORE + SECTION_FONT * 1.2 + SECTION_GAP_AFTER;
// Usable vertical band for tasks. Widened so pages pack fuller (less white
// space) while staying clear of the footer logo (y≈648) and corner triangles.
const AREA_BOTTOM = 624;
const PAGE1_TOP = 312;
const CONT_TOP = 200;

// One heading per status bucket, shown once above its tasks.
const SECTION_LABELS: Record<string, string> = {
  Delivered: "✅ Delivered",
  "In review": "👀 In Review",
  "In progress": "🔨 In Progress",
};

function rows(text: string, charsPerLine: number): number {
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

function titleChars(textW: number): number {
  return Math.max(16, Math.floor(textW / (TITLE_FONT * 0.55)));
}
function detailChars(textW: number): number {
  return Math.max(20, Math.floor(textW / (DETAIL_FONT * 0.52)));
}
function pointChars(textW: number): number {
  return Math.max(20, Math.floor((textW - POINT_INDENT) / (POINT_FONT * 0.52)));
}

function taskHeight(
  task: SlideTask,
  textW: number,
  startsSection = false,
): number {
  let h = startsSection ? SECTION_H : 0;
  h += rows(task.title, titleChars(textW)) * (TITLE_FONT * 1.2);
  if (task.detail)
    h += DETAIL_GAP + rows(task.detail, detailChars(textW)) * (DETAIL_FONT * 1.3);
  if (task.points?.length) {
    for (const p of task.points) {
      h += POINT_GAP + rows(p, pointChars(textW)) * (POINT_FONT * 1.3);
    }
  }
  return h + TASK_GAP;
}

/** Turn loosely-structured input into title/detail tasks. */
function normalizeTasks(data: {
  bullets?: string[];
  tasks?: SlideTask[];
}): SlideTask[] {
  if (data.tasks?.length) return data.tasks;
  if (data.bullets?.length) {
    return data.bullets.map((b) => {
      const parts = b.split(/\s+[—–]\s+/);
      return parts.length > 1
        ? { title: parts[0].trim(), detail: parts.slice(1).join(" — ").trim() }
        : { title: b.trim() };
    });
  }
  return [{ title: "Add what you worked on this week." }];
}

function paginate(tasks: SlideTask[], textW: number): SlideTask[][] {
  const page1Cap = AREA_BOTTOM - PAGE1_TOP;
  const contCap = AREA_BOTTOM - CONT_TOP;
  const pages: SlideTask[][] = [];
  let cur: SlideTask[] = [];
  let used = 0;
  let cap = page1Cap;
  let prevSection: string | undefined;
  for (const t of tasks) {
    const startsSection = !!t.section && t.section !== prevSection;
    const h = taskHeight(t, textW, startsSection);
    if (cur.length && used + h > cap) {
      pages.push(cur);
      cur = [];
      used = 0;
      cap = contCap;
      prevSection = undefined; // re-show the section heading atop the new page
    }
    cur.push(t);
    // first task on a fresh page always re-emits its heading
    used += taskHeight(t, textW, !!t.section && t.section !== prevSection);
    prevSection = t.section;
  }
  if (cur.length) pages.push(cur);
  return pages.length ? pages : [[{ title: "Add what you worked on this week." }]];
}

interface PageMeta {
  tasks: SlideTask[];
  pageIndex: number;
  pageCount: number;
}

function personPage(
  member: TeamMember,
  data: { role?: string; eyebrow?: string },
  page: PageMeta,
): SlideDocument {
  const side = member.style.avatar;
  const isCont = page.pageIndex > 0;

  // column geometry per avatar side
  const geo =
    side === "left"
      ? { textX: 470, textW: 700, markerX: 438, avatarX: 80, blobX: 42 }
      : { textX: 96, textW: 640, markerX: 64, avatarX: 858, blobX: 815 };

  const areaTop = isCont ? CONT_TOP : PAGE1_TOP;
  const titleCpl = titleChars(geo.textW);
  const detailCpl = detailChars(geo.textW);
  const pointCpl = pointChars(geo.textW);

  const elements: SlideElement[] = [];

  // decorative accent blob + avatar
  elements.push(
    shape({
      kind: "blob",
      x: geo.blobX,
      y: isCont ? 60 : 90,
      w: isCont ? 320 : 430,
      h: isCont ? 320 : 430,
      fill: member.accent,
      opacity: 0.3,
      z: 1,
    }),
  );
  elements.push(
    image({
      url: member.avatar,
      x: isCont ? geo.avatarX + 70 : geo.avatarX,
      y: isCont ? 96 : 120,
      w: isCont ? 180 : 320,
      h: isCont ? 180 : 320,
      circle: true,
      shadow: true,
      anim: "pop",
      z: 4,
    }),
  );

  // header
  if (isCont) {
    elements.push(
      text({
        text: `${member.name} — continued`,
        role: "title",
        x: geo.textX,
        y: 120,
        w: geo.textW,
        fontFamily: DISPLAY,
        fontSize: 44,
        fontWeight: 800,
        color: INK,
        anim: "up",
      }),
      shape({ kind: "line", x: geo.textX, y: 192, w: 100, h: 5, radius: 3, fill: member.accent, anim: "left", z: 3 }),
    );
  } else {
    elements.push(
      text({
        text: (data.eyebrow ?? "Weekly Update").toUpperCase(),
        role: "eyebrow",
        x: geo.textX,
        y: 110,
        w: geo.textW,
        fontFamily: DISPLAY,
        fontSize: 20,
        fontWeight: 700,
        letterSpacing: 5,
        color: "#f4691e",
        uppercase: true,
        anim: "left",
      }),
      text({
        text: member.name,
        role: "title",
        x: geo.textX - 4,
        y: 150,
        w: geo.textW + 60,
        fontFamily: DISPLAY,
        fontSize: 66,
        fontWeight: 800,
        lineHeight: 1.0,
        color: INK,
        anim: "up",
      }),
      text({
        text: data.role ?? member.role,
        role: "role",
        x: geo.textX,
        y: 236,
        w: geo.textW,
        fontFamily: DISPLAY,
        fontSize: 26,
        fontWeight: 600,
        color: member.accent,
        anim: "up",
      }),
      shape({ kind: "line", x: geo.textX, y: 292, w: 120, h: 5, radius: 3, fill: member.accent, anim: "left", z: 3 }),
    );
  }

  // tasks (packed): optional section heading, then bold title + detail + points
  let y = areaTop;
  let renderedSection: string | undefined;
  for (const t of page.tasks) {
    if (t.section && t.section !== renderedSection) {
      y += SECTION_GAP_BEFORE;
      elements.push(
        text({
          text: SECTION_LABELS[t.section] ?? t.section,
          role: "eyebrow",
          x: geo.textX,
          y,
          w: geo.textW,
          fontFamily: DISPLAY,
          fontSize: SECTION_FONT,
          fontWeight: 800,
          letterSpacing: 2,
          color: member.accent,
          uppercase: true,
          anim: "left",
          z: 6,
        }),
      );
      y += SECTION_FONT * 1.2 + SECTION_GAP_AFTER;
      renderedSection = t.section;
    }
    const hasDetail = !!t.detail;
    const isHeading = hasDetail || !!t.points?.length;
    elements.push(
      shape({
        kind: "rect",
        x: geo.markerX,
        y: y + 7,
        w: 14,
        h: 14,
        radius: 4,
        fill: member.accent,
        anim: "pop",
        z: 6,
      }),
    );
    elements.push(
      text({
        text: t.title,
        role: "bullet",
        x: geo.textX,
        y,
        w: geo.textW,
        fontFamily: isHeading ? DISPLAY : SANS,
        fontSize: TITLE_FONT,
        fontWeight: isHeading ? 700 : 400,
        lineHeight: 1.2,
        color: INK,
        anim: "up",
        z: 6,
      }),
    );
    // cursor that walks down through the title, detail, then each point
    let ty = y + rows(t.title, titleCpl) * (TITLE_FONT * 1.2);
    if (t.detail) {
      elements.push(
        text({
          text: t.detail,
          role: "body",
          x: geo.textX,
          y: ty + DETAIL_GAP,
          w: geo.textW,
          fontSize: DETAIL_FONT,
          fontWeight: 400,
          lineHeight: 1.3,
          color: "#6b5836",
          anim: "up",
          z: 6,
        }),
      );
      ty += DETAIL_GAP + rows(t.detail, detailCpl) * (DETAIL_FONT * 1.3);
    }
    // up to 4 plain-language points, rendered as indented bullets
    for (const p of t.points ?? []) {
      ty += POINT_GAP;
      elements.push(
        text({
          text: `•  ${p}`,
          role: "body",
          x: geo.textX + POINT_INDENT,
          y: ty,
          w: geo.textW - POINT_INDENT,
          fontSize: POINT_FONT,
          fontWeight: 400,
          lineHeight: 1.3,
          color: "#6b5836",
          anim: "up",
          z: 6,
        }),
      );
      ty += rows(p, pointCpl) * (POINT_FONT * 1.3);
    }
    // section heading height (if any) was already advanced above
    y += taskHeight(t, geo.textW, false);
  }

  // page pill when multi-page
  if (page.pageCount > 1) {
    elements.push(
      text({
        text: `${page.pageIndex + 1} / ${page.pageCount}`,
        role: "footer",
        x: STAGE_WIDTH - 200,
        y: 668,
        w: 130,
        align: "right",
        fontFamily: DISPLAY,
        fontSize: 16,
        fontWeight: 700,
        color: "#a08a5e",
        anim: "fade",
        z: 7,
      }),
    );
  }

  elements.push(logo({ x: 96, y: 648, w: 150, z: 7 }));
  elements.push(...cornerTriangles());

  const background =
    member.style.bg === "mesh"
      ? ({ kind: "mesh" } as const)
      : ({ kind: "solid", color: "#fff8ea" } as const);

  // keep this page's source tasks on the doc so it can be re-tidied / rewritten
  return {
    background,
    elements,
    person: { role: data.role, eyebrow: data.eyebrow, tasks: page.tasks },
  };
}

/** Build one or more slides for a person, splitting long updates across pages. */
export function buildPersonSlides(
  member: TeamMember,
  data: {
    role?: string;
    eyebrow?: string;
    bullets?: string[];
    tasks?: SlideTask[];
  },
): SlideDocument[] {
  const side = member.style.avatar;
  const textW = side === "left" ? 700 : 640;
  const pages = paginate(normalizeTasks(data), textW);
  return pages.map((tasks, i) =>
    personPage(member, data, {
      tasks,
      pageIndex: i,
      pageCount: pages.length,
    }),
  );
}

/** Single-slide convenience (first page only). */
export function buildPersonSlide(
  member: TeamMember,
  data: {
    role?: string;
    eyebrow?: string;
    bullets?: string[];
    tasks?: SlideTask[];
  },
): SlideDocument {
  return buildPersonSlides(member, data)[0];
}

const SUMMARY_COLUMNS: { status: SummaryStatus; color: string; headInk: string }[] =
  [
    { status: "In Progress", color: "#fbbf09", headInk: "#1c1407" },
    { status: "In Review", color: "#f79009", headInk: "#ffffff" },
    { status: "Released", color: "#f4691e", headInk: "#ffffff" },
  ];

// Status-board geometry. Every item is shown: items are grouped by person in
// each column, and the board continues onto extra pages only when needed.
const SUM_LEFT = 70;
const SUM_GAP = 28;
const SUM_COL_W = Math.round((STAGE_WIDTH - SUM_LEFT * 2 - SUM_GAP * 2) / 3);
const SUM_HEAD_H = 54;
const SUM_PAD_X = 18;
const SUM_PAD_TOP = 20;
const SUM_PAD_BOTTOM = 18;
const SUM_CARD_BOTTOM = 664;
const SUM_TOP_FIRST = 200;
const SUM_TOP_CONT = 150;

interface SumMetrics {
  avatar: number;
  nameFont: number;
  nameGap: number;
  labelFont: number;
  labelLH: number;
  labelGap: number;
  blockGap: number;
}
const SUM_NORMAL: SumMetrics = {
  avatar: 36,
  nameFont: 13,
  nameGap: 4,
  labelFont: 15,
  labelLH: 1.25,
  labelGap: 5,
  blockGap: 16,
};
// tried first when the normal size would spill onto a second page
const SUM_COMPACT: SumMetrics = {
  avatar: 30,
  nameFont: 12,
  nameGap: 3,
  labelFont: 14,
  labelLH: 1.2,
  labelGap: 3,
  blockGap: 10,
};

interface SumBlock {
  personKey: string;
  labels: string[];
  /** this person's list started on an earlier page */
  cont?: boolean;
}

const sumTextX = (m: SumMetrics) => SUM_PAD_X + m.avatar + 12;
const sumLabelX = (m: SumMetrics) => sumTextX(m) + 12;
const sumLabelW = (m: SumMetrics) => SUM_COL_W - sumLabelX(m) - SUM_PAD_X;

/** Lines a label wraps to, simulating greedy word-wrap (long words wrap early). */
function wrappedLines(label: string, charsPerLine: number): number {
  let lines = 1;
  let used = 0;
  for (const word of label.split(/\s+/).filter(Boolean)) {
    const len = word.length;
    if (used && used + 1 + len > charsPerLine) {
      lines++;
      used = 0;
    }
    if (len > charsPerLine) {
      lines += Math.ceil(len / charsPerLine) - 1;
      used = len % charsPerLine || charsPerLine;
    } else {
      used += (used ? 1 : 0) + len;
    }
  }
  return lines;
}

function sumLabelH(label: string, m: SumMetrics): number {
  const cpl = Math.max(12, Math.floor(sumLabelW(m) / (m.labelFont * 0.55)));
  return wrappedLines(label, cpl) * m.labelFont * m.labelLH;
}

function sumBlockH(labels: string[], m: SumMetrics): number {
  const labelsH =
    labels.reduce((h, l) => h + sumLabelH(l, m), 0) +
    Math.max(0, labels.length - 1) * m.labelGap;
  return Math.max(m.avatar, m.nameFont * 1.2 + m.nameGap + labelsH);
}

// usable height inside a card on the first page / on continuation pages
const SUM_CAP_FIRST =
  SUM_CARD_BOTTOM - SUM_PAD_BOTTOM - (SUM_TOP_FIRST + SUM_HEAD_H + SUM_PAD_TOP);
const SUM_CAP_CONT =
  SUM_CARD_BOTTOM - SUM_PAD_BOTTOM - (SUM_TOP_CONT + SUM_HEAD_H + SUM_PAD_TOP);

/**
 * Pack one column's person blocks into card-sized lanes: the first lane fits
 * the first page, later lanes fit continuation pages. Long lists split.
 */
function packLanes(blocks: SumBlock[], m: SumMetrics): SumBlock[][] {
  const lanes: SumBlock[][] = [[]];
  let used = 0;
  for (const block of blocks) {
    let rest = block.labels;
    let cont = false;
    while (rest.length) {
      const lane = lanes[lanes.length - 1];
      const room = (lanes.length === 1 ? SUM_CAP_FIRST : SUM_CAP_CONT) - used;
      let fit = 0;
      while (fit < rest.length && sumBlockH(rest.slice(0, fit + 1), m) <= room)
        fit++;
      // don't strand a lone label at the bottom — start a fresh lane instead
      if (lane.length && fit < Math.min(2, rest.length)) {
        lanes.push([]);
        used = 0;
        continue;
      }
      const take = Math.max(1, fit);
      const labels = rest.slice(0, take);
      lane.push({ personKey: block.personKey, labels, cont });
      used += sumBlockH(labels, m) + m.blockGap;
      rest = rest.slice(take);
      cont = true;
      if (rest.length) {
        lanes.push([]);
        used = 0;
      }
    }
  }
  return lanes;
}

interface SumLane {
  /** index into SUMMARY_COLUMNS */
  ci: number;
  blocks: SumBlock[];
}

/** One status card: coloured header, then each person's avatar + items. */
function summaryLane(
  elements: SlideElement[],
  opts: { x: number; cardTop: number; lane: SumLane; total: number; cont: boolean; m: SumMetrics },
) {
  const { x, cardTop, lane, m } = opts;
  const col = SUMMARY_COLUMNS[lane.ci];
  const contentTop = cardTop + SUM_HEAD_H + SUM_PAD_TOP;

  elements.push(
    // card
    shape({
      kind: "rect",
      x,
      y: cardTop,
      w: SUM_COL_W,
      h: SUM_CARD_BOTTOM - cardTop,
      radius: 22,
      fill: "#ffffff",
      opacity: 0.92,
      anim: "up",
      z: 2,
    }),
    // header bar
    shape({
      kind: "rect",
      x,
      y: cardTop,
      w: SUM_COL_W,
      h: SUM_HEAD_H,
      radius: 22,
      fill: col.color,
      anim: "left",
      z: 3,
    }),
    text({
      text: opts.cont
        ? `${col.status}  ·  continued`
        : `${col.status}  ·  ${opts.total}`,
      role: "subtitle",
      x: x + 22,
      y: cardTop + 14,
      w: SUM_COL_W - 44,
      fontFamily: DISPLAY,
      fontSize: 22,
      fontWeight: 700,
      color: col.headInk,
      anim: "fade",
      z: 4,
    }),
  );

  if (!lane.blocks.length) {
    elements.push(
      text({
        text: "Nothing here this week",
        role: "footer",
        x: x + 22,
        y: contentTop,
        w: SUM_COL_W - 44,
        fontSize: 15,
        fontWeight: 500,
        italic: true,
        color: "#a08a5e",
        anim: "fade",
        z: 5,
      }),
    );
    return;
  }

  let y = contentTop;
  for (const block of lane.blocks) {
    const member = getMember(block.personKey);
    if (member) {
      elements.push(
        image({
          url: member.avatar,
          x: x + SUM_PAD_X,
          y,
          w: m.avatar,
          h: m.avatar,
          circle: true,
          anim: "pop",
          z: 5,
        }),
      );
    }
    const name = member ? shortName(member) : block.personKey;
    elements.push(
      text({
        text: block.cont ? `${name} (cont.)` : name,
        role: "eyebrow",
        x: x + sumTextX(m),
        y: y + 1,
        w: SUM_COL_W - sumTextX(m) - SUM_PAD_X,
        fontFamily: DISPLAY,
        fontSize: m.nameFont,
        fontWeight: 700,
        letterSpacing: 1.5,
        lineHeight: 1.2,
        color: "#a08a5e",
        uppercase: true,
        anim: "fade",
        z: 5,
      }),
    );
    let ly = y + m.nameFont * 1.2 + m.nameGap;
    for (const label of block.labels) {
      const lineH = m.labelFont * m.labelLH;
      elements.push(
        shape({
          kind: "rect",
          x: x + sumTextX(m),
          y: Math.round(ly + lineH / 2 - 3),
          w: 6,
          h: 6,
          radius: 3,
          fill: col.color,
          anim: "pop",
          z: 5,
        }),
        text({
          text: label,
          role: "body",
          x: x + sumLabelX(m),
          y: Math.round(ly),
          w: sumLabelW(m),
          fontSize: m.labelFont,
          fontWeight: 500,
          lineHeight: m.labelLH,
          color: INK,
          anim: "up",
          z: 5,
        }),
      );
      ly += sumLabelH(label, m) + m.labelGap;
    }
    y += sumBlockH(block.labels, m) + m.blockGap;
  }
}

function summaryPage(opts: {
  pageIndex: number;
  pageCount: number;
  lanes: SumLane[];
  totals: number[];
  m: SumMetrics;
  items: SummaryItem[];
  dateStr?: string;
}): SlideDocument {
  const { pageIndex, pageCount, lanes, m } = opts;
  const isCont = pageIndex > 0;
  const cardTop = isCont ? SUM_TOP_CONT : SUM_TOP_FIRST;
  const eyebrow = (opts.dateStr ?? "This Week").toUpperCase();

  const elements: SlideElement[] = isCont
    ? [
        logo({ x: 1056, y: 40, w: 140, z: 9 }),
        text({
          text: eyebrow,
          role: "eyebrow",
          x: 70,
          y: 46,
          w: 700,
          fontFamily: DISPLAY,
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: 4,
          color: "#f4691e",
          uppercase: true,
          anim: "left",
        }),
        text({
          text: "This Week at Sigma — continued",
          role: "title",
          x: 68,
          y: 74,
          w: 900,
          fontFamily: DISPLAY,
          fontSize: 40,
          fontWeight: 800,
          color: INK,
          anim: "up",
        }),
      ]
    : [
        logo({ x: 1024, y: 56, w: 172, z: 9 }),
        text({
          text: eyebrow,
          role: "eyebrow",
          x: 70,
          y: 64,
          w: 700,
          fontFamily: DISPLAY,
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: 4,
          color: "#f4691e",
          uppercase: true,
          anim: "left",
        }),
        text({
          text: "This Week at Sigma",
          role: "title",
          x: 68,
          y: 100,
          w: 900,
          fontFamily: DISPLAY,
          fontSize: 58,
          fontWeight: 800,
          color: INK,
          anim: "up",
        }),
      ];

  // a part-filled last page keeps its cards centred
  const rowW = lanes.length * SUM_COL_W + (lanes.length - 1) * SUM_GAP;
  const startX = Math.round((STAGE_WIDTH - rowW) / 2);
  lanes.forEach((lane, i) =>
    summaryLane(elements, {
      x: startX + i * (SUM_COL_W + SUM_GAP),
      cardTop,
      lane,
      total: opts.totals[lane.ci],
      cont: isCont,
      m,
    }),
  );

  if (pageCount > 1) {
    elements.push(
      text({
        text: `${pageIndex + 1} / ${pageCount}`,
        role: "footer",
        x: STAGE_WIDTH - 200,
        y: 680,
        w: 130,
        align: "right",
        fontFamily: DISPLAY,
        fontSize: 16,
        fontWeight: 700,
        color: "#a08a5e",
        anim: "fade",
        z: 7,
      }),
    );
  }

  // keep the structured items on the doc so the OG/download image matches.
  return { background: { kind: "mesh" }, elements, summary: opts.items };
}

/**
 * The team status board. Every item is shown, grouped by person. Page 1 is
 * the familiar three-column board; anything that doesn't fit (even at a
 * compact size) continues on extra pages that only carry the columns that
 * overflowed, three cards per page.
 */
export function buildSummarySlides(
  items: SummaryItem[],
  dateStr?: string,
): SlideDocument[] {
  const grouped = SUMMARY_COLUMNS.map((col) => ({
    total: items.filter((it) => it.status === col.status).length,
    blocks: groupByPerson(items, col.status) as SumBlock[],
  }));
  const layout = (m: SumMetrics) => grouped.map((g) => packLanes(g.blocks, m));

  let m = SUM_NORMAL;
  let columns = layout(m);
  if (columns.some((lanes) => lanes.length > 1)) {
    const compact = layout(SUM_COMPACT);
    if (compact.every((lanes) => lanes.length === 1)) {
      m = SUM_COMPACT;
      columns = compact;
    }
  }

  const first: SumLane[] = columns.map((lanes, ci) => ({ ci, blocks: lanes[0] }));
  const overflow: SumLane[] = columns.flatMap((lanes, ci) =>
    lanes.slice(1).map((blocks) => ({ ci, blocks })),
  );
  const pages = [first];
  for (let i = 0; i < overflow.length; i += 3) pages.push(overflow.slice(i, i + 3));

  const totals = grouped.map((g) => g.total);
  return pages.map((lanes, pageIndex) =>
    summaryPage({
      pageIndex,
      pageCount: pages.length,
      lanes,
      totals,
      m,
      items,
      dateStr,
    }),
  );
}

export function buildThankYouSlide(): SlideDocument {
  const elements: SlideElement[] = [
    text({
      text: "Thank you!",
      role: "title",
      x: 0,
      y: 240,
      w: STAGE_WIDTH,
      fontFamily: DISPLAY,
      fontSize: 130,
      fontWeight: 800,
      align: "center",
      color: "#ffffff",
      anim: "pop",
      z: 5,
    }),
    text({
      text: "Feel free to approach us if you have any questions.",
      role: "subtitle",
      x: 0,
      y: 420,
      w: STAGE_WIDTH,
      fontSize: 30,
      fontWeight: 500,
      align: "center",
      color: "#fff8ea",
      anim: "up",
      z: 5,
    }),
    text({
      text: "Sigma Lending",
      role: "footer",
      x: 0,
      y: 600,
      w: STAGE_WIDTH,
      fontFamily: DISPLAY,
      fontSize: 28,
      fontWeight: 700,
      align: "center",
      color: "#ffffff",
      anim: "fade",
      z: 5,
    }),
  ];
  return {
    background: { kind: "gradient", from: "#f79009", to: "#e8420e", angle: 135 },
    elements,
  };
}

export function buildBlankSlide(): SlideDocument {
  return {
    background: { kind: "solid", color: "#fff8ea" },
    elements: [
      text({
        text: "New slide",
        role: "title",
        x: 96,
        y: 110,
        w: 700,
        fontFamily: DISPLAY,
        fontSize: 60,
        fontWeight: 800,
      }),
      logo({ x: 96, y: 642, w: 150, z: 7 }),
      ...cornerTriangles(),
    ],
  };
}
