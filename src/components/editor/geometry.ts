import { SlideElement, STAGE_WIDTH, STAGE_HEIGHT } from "@/lib/types";

// Pure layout helpers shared by the canvas (drag / snap / marquee) and the
// editor (align / distribute / layering). All values are stage pixels.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Rendered heights of auto-height text boxes, measured by the canvas. */
export type Heights = Record<string, number>;

export interface Guide {
  axis: "x" | "y";
  pos: number;
}

export function elHeight(el: SlideElement, heights: Heights): number {
  if (el.type !== "text") return el.h;
  return (
    el.h ??
    heights[el.id] ??
    Math.round(el.fontSize * (el.lineHeight ?? 1.3))
  );
}

export function boxOf(el: SlideElement, heights: Heights): Box {
  return { x: el.x, y: el.y, w: el.w, h: elHeight(el, heights) };
}

export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const b of boxes) {
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function contains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

/**
 * `ids` plus every element sharing a group with one of them. The given ids
 * come last so the clicked element stays the "primary" (last) selection.
 */
export function expandGroups(ids: string[], elements: SlideElement[]): string[] {
  const groups = new Set(
    elements.filter((e) => ids.includes(e.id) && e.groupId).map((e) => e.groupId),
  );
  const extra = elements
    .filter((e) => e.groupId && groups.has(e.groupId) && !ids.includes(e.id))
    .map((e) => e.id);
  return [...extra, ...ids];
}

/** Split a selection into move-together units (one per group, else per element). */
export function selectionUnits(selected: SlideElement[]): SlideElement[][] {
  const byGroup = new Map<string, SlideElement[]>();
  const units: SlideElement[][] = [];
  for (const el of selected) {
    if (!el.groupId) {
      units.push([el]);
      continue;
    }
    const list = byGroup.get(el.groupId);
    if (list) list.push(el);
    else {
      const fresh = [el];
      byGroup.set(el.groupId, fresh);
      units.push(fresh);
    }
  }
  return units;
}

/** Snap candidates: the slide's edges + centre, and each target's edges + centre. */
export function snapCandidates(targets: Box[]): { xs: number[]; ys: number[] } {
  const xs = [0, STAGE_WIDTH / 2, STAGE_WIDTH];
  const ys = [0, STAGE_HEIGHT / 2, STAGE_HEIGHT];
  for (const t of targets) {
    xs.push(t.x, t.x + t.w / 2, t.x + t.w);
    ys.push(t.y, t.y + t.h / 2, t.y + t.h);
  }
  return { xs, ys };
}

/**
 * Find the smallest offset (within `thr`) that lines one of `lines` up with a
 * candidate. Returns the offset plus every candidate that ends up aligned, so
 * the canvas can draw a guide for each.
 */
export function snapAxis(
  lines: number[],
  cands: number[],
  thr: number,
): { off: number; hits: number[] } {
  let best: number | null = null;
  for (const l of lines) {
    for (const c of cands) {
      const d = c - l;
      if (Math.abs(d) <= thr && (best === null || Math.abs(d) < Math.abs(best)))
        best = d;
    }
  }
  if (best === null) return { off: 0, hits: [] };
  const off = best;
  const hits = cands.filter((c) => lines.some((l) => Math.abs(l + off - c) < 0.5));
  return { off, hits: [...new Set(hits)] };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Elements in paint order (z, then array position) — matches the renderer. */
export function paintOrder(elements: SlideElement[]): SlideElement[] {
  return elements
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.z ?? 1) - (b.e.z ?? 1) || a.i - b.i)
    .map((x) => x.e);
}

export type LayerMove = "front" | "forward" | "backward" | "back";

/**
 * Re-stack the selected elements, Canva-style: "forward"/"backward" hop past
 * the next element that actually overlaps (so the change is visible), and
 * "front"/"back" jump to the top/bottom. Returns new z values for everything.
 */
export function restack(
  elements: SlideElement[],
  ids: Set<string>,
  move: LayerMove,
  heights: Heights,
): Record<string, number> {
  const order = paintOrder(elements);
  let next: SlideElement[];
  if (move === "front") {
    next = [...order.filter((e) => !ids.has(e.id)), ...order.filter((e) => ids.has(e.id))];
  } else if (move === "back") {
    next = [...order.filter((e) => ids.has(e.id)), ...order.filter((e) => !ids.has(e.id))];
  } else {
    const up = move === "forward";
    const arr = up ? [...order] : [...order].reverse();
    // walk from the far end so selected neighbours don't leapfrog each other
    for (let i = arr.length - 1; i >= 0; i--) {
      if (!ids.has(arr[i].id)) continue;
      const me = boxOf(arr[i], heights);
      let j = i + 1;
      while (
        j < arr.length &&
        !ids.has(arr[j].id) &&
        !intersects(me, boxOf(arr[j], heights))
      )
        j++;
      let target: number;
      if (j >= arr.length) target = arr.length - 1;
      else if (ids.has(arr[j].id)) target = j - 1;
      else target = j;
      if (target <= i) continue;
      const [el] = arr.splice(i, 1);
      arr.splice(target, 0, el);
    }
    next = up ? arr : arr.reverse();
  }
  return Object.fromEntries(next.map((e, i) => [e.id, i + 1]));
}
