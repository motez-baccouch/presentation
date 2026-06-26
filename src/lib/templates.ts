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
import { TeamMember, TEAM, getMember } from "./team";

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
const TASK_GAP = 18;
const DETAIL_GAP = 4;
const POINT_GAP = 3;
const POINT_INDENT = 20;
const AREA_BOTTOM = 600;
const PAGE1_TOP = 320;
const CONT_TOP = 248;

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

function taskHeight(task: SlideTask, textW: number): number {
  let h = rows(task.title, titleChars(textW)) * (TITLE_FONT * 1.2);
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
  for (const t of tasks) {
    const h = taskHeight(t, textW);
    if (cur.length && used + h > cap) {
      pages.push(cur);
      cur = [];
      used = 0;
      cap = contCap;
    }
    cur.push(t);
    used += h;
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

  // tasks (packed): bold title + optional detail line + optional points
  let y = areaTop;
  for (const t of page.tasks) {
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
    y += taskHeight(t, geo.textW);
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

  return { background, elements };
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

export function buildSummarySlide(
  items: SummaryItem[],
  dateStr?: string,
): SlideDocument {
  const elements: SlideElement[] = [
    logo({ x: 1024, y: 56, w: 172, z: 9 }),
    text({
      text: (dateStr ?? "This Week").toUpperCase(),
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

  const left = 70;
  const gap = 28;
  const colW = Math.round((STAGE_WIDTH - left * 2 - gap * 2) / 3);
  const cardTop = 212;
  const cardH = 440;
  const headH = 54;
  const itemTop = cardTop + headH + 22;
  const itemStep = 68;
  const maxItems = 5;

  SUMMARY_COLUMNS.forEach((col, ci) => {
    const x = left + ci * (colW + gap);
    const colItems = items.filter((it) => it.status === col.status);

    // card
    elements.push(
      shape({
        kind: "rect",
        x,
        y: cardTop,
        w: colW,
        h: cardH,
        radius: 22,
        fill: "#ffffff",
        opacity: 0.92,
        anim: "up",
        z: 2,
      }),
    );
    // header bar
    elements.push(
      shape({
        kind: "rect",
        x,
        y: cardTop,
        w: colW,
        h: headH,
        radius: 22,
        fill: col.color,
        anim: "left",
        z: 3,
      }),
    );
    elements.push(
      text({
        text: `${col.status}  ·  ${colItems.length}`,
        role: "subtitle",
        x: x + 22,
        y: cardTop + 14,
        w: colW - 44,
        fontFamily: DISPLAY,
        fontSize: 22,
        fontWeight: 700,
        color: col.headInk,
        anim: "fade",
        z: 4,
      }),
    );

    colItems.slice(0, maxItems).forEach((it, ii) => {
      const y = itemTop + ii * itemStep;
      const member = getMember(it.personKey);
      if (member) {
        elements.push(
          image({
            url: member.avatar,
            x: x + 18,
            y,
            w: 40,
            h: 40,
            circle: true,
            anim: "pop",
            z: 5,
          }),
        );
      }
      elements.push(
        text({
          text: it.label,
          role: "body",
          x: x + 68,
          y: y - 2,
          w: colW - 86,
          fontSize: 16,
          fontWeight: 500,
          lineHeight: 1.2,
          color: INK,
          anim: "up",
          z: 5,
        }),
      );
    });

    if (colItems.length > maxItems) {
      elements.push(
        text({
          text: `+${colItems.length - maxItems} more`,
          role: "footer",
          x: x + 22,
          y: cardTop + cardH - 34,
          w: colW - 44,
          fontSize: 14,
          fontWeight: 600,
          color: "#a08a5e",
          anim: "fade",
          z: 5,
        }),
      );
    }
  });

  // keep the structured items on the doc so the OG/download image matches.
  return { background: { kind: "mesh" }, elements, summary: items };
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
