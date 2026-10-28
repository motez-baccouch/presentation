"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import {
  SlideData,
  SlideElement,
  TextElement,
  STAGE_WIDTH,
  STAGE_HEIGHT,
} from "@/lib/types";
import {
  StageBackground,
  ImageContent,
  VideoContent,
  ShapeContent,
  textStyle,
} from "../stage/elements";
import { EditingHereBadge } from "./Presence";
import { QuickBar } from "./QuickBar";
import {
  Box,
  Guide,
  Heights,
  boxOf,
  clamp,
  contains,
  expandGroups,
  intersects,
  paintOrder,
  selectionUnits,
  snapAxis,
  snapCandidates,
  unionBox,
} from "./geometry";
import type { EditorActions, ElementPatch, Patches } from "./actions";

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type Point = { x: number; y: number };

const ACCENT = "#f4691e";
const GUIDE = "#e8420e";
const DRAG_THRESHOLD = 3; // screen px before a press becomes a drag
const SNAP_PX = 6; // screen px snapping distance
const MIN_SIZE = 12; // stage px

const ALL_HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const TEXT_HANDLES: Handle[] = ["nw", "ne", "e", "se", "sw", "w"];
const CORNERS: Handle[] = ["nw", "ne", "se", "sw"];
const CURSORS: Record<Handle, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

function TextEditable({
  el,
  editing,
  caretAt,
  onInput,
  onStopEditing,
}: {
  el: TextElement;
  editing: boolean;
  caretAt: Point | null;
  onInput: (text: string) => void;
  onStopEditing: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (ref.current) ref.current.innerText = el.text;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      ref.current &&
      document.activeElement !== ref.current &&
      ref.current.innerText !== el.text
    ) {
      ref.current.innerText = el.text;
    }
  }, [el.text]);

  useEffect(() => {
    if (!editing || !ref.current) return;
    const node = ref.current;
    node.focus();
    // put the caret where the user double-clicked, else at the end
    let range: Range | null = null;
    if (caretAt) {
      const doc = document as Document & {
        caretPositionFromPoint?: (
          x: number,
          y: number,
        ) => { offsetNode: Node; offset: number } | null;
      };
      if (doc.caretPositionFromPoint) {
        const pos = doc.caretPositionFromPoint(caretAt.x, caretAt.y);
        if (pos && node.contains(pos.offsetNode)) {
          range = document.createRange();
          range.setStart(pos.offsetNode, pos.offset);
          range.collapse(true);
        }
      } else if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(caretAt.x, caretAt.y);
        if (r && node.contains(r.startContainer)) range = r;
      }
    }
    if (!range) {
      range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
    }
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  return (
    <div
      ref={ref}
      contentEditable={editing}
      suppressContentEditableWarning
      onInput={(e) => onInput(e.currentTarget.innerText)}
      onBlur={onStopEditing}
      onKeyDown={(e) => {
        if (e.key === "Escape") e.currentTarget.blur();
      }}
      // paste as plain text so rich formatting never sneaks into the DOM
      onPaste={(e) => {
        e.preventDefault();
        document.execCommand(
          "insertText",
          false,
          e.clipboardData.getData("text/plain"),
        );
      }}
      style={{
        ...textStyle(el),
        width: "100%",
        cursor: editing ? "text" : "inherit",
        outline: "none",
      }}
    />
  );
}

function ElementBody({
  el,
  editing,
  caretAt,
  onInput,
  onStopEditing,
}: {
  el: SlideElement;
  editing: boolean;
  caretAt: Point | null;
  onInput: (text: string) => void;
  onStopEditing: () => void;
}) {
  if (el.type === "text")
    return (
      <TextEditable
        el={el}
        editing={editing}
        caretAt={caretAt}
        onInput={onInput}
        onStopEditing={onStopEditing}
      />
    );
  if (el.type === "image") return <ImageContent el={el} />;
  if (el.type === "video") return <VideoContent el={el} play={false} />;
  return <ShapeContent el={el} />;
}

export function EditorCanvas({
  slide,
  selectedIds,
  othersHere = [],
  heightsRef,
  actions,
  onSetSelection,
  onUpdateElement,
  onUpdateElements,
  onCommitPatches,
  onDeleteElement,
  onDropFiles,
}: {
  slide: SlideData;
  selectedIds: string[];
  othersHere?: string[];
  /** canvas-measured text heights, shared with the editor for align/layering */
  heightsRef: RefObject<Heights>;
  actions: EditorActions;
  onSetSelection: (ids: string[]) => void;
  onUpdateElement: (id: string, patch: ElementPatch) => void;
  /** quick edits from the floating toolbar (bursts coalesce into one undo step) */
  onUpdateElements: (patches: Patches) => void;
  /** commit a finished gesture (drag / resize / rotate) as one undo step */
  onCommitPatches: (patches: Patches) => void;
  onDeleteElement: (id: string) => void;
  onDropFiles: (files: File[], at: Point) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [editing, setEditing] = useState<{ id: string; at: Point | null } | null>(
    null,
  );
  // live (uncommitted) geometry while a gesture is in progress
  const [preview, setPreview] = useState<Patches | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [badge, setBadge] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [gesture, setGesture] = useState<
    null | "move" | "resize" | "rotate" | "marquee"
  >(null);
  const [menu, setMenu] = useState<Point | null>(null);
  const [dropping, setDropping] = useState(false);
  const [heights, setHeights] = useState<Heights>({});
  const endGesture = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const update = () => setScale(node.clientWidth / STAGE_WIDTH);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // ---- measure rendered element heights (auto-height text boxes) ----------
  const nodes = useRef(new Set<HTMLDivElement>());
  const roRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      setHeights((prev) => {
        let next: Heights | null = null;
        for (const entry of entries) {
          const node = entry.target as HTMLDivElement;
          const id = node.dataset.elId;
          if (!id) continue;
          const h = node.offsetHeight;
          if (prev[id] !== h) {
            next ??= { ...prev };
            next[id] = h;
          }
        }
        return next ?? prev;
      });
    });
    roRef.current = ro;
    nodes.current.forEach((n) => ro.observe(n));
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    heightsRef.current = heights;
  }, [heights, heightsRef]);

  // one stable callback ref for every element wrapper (React 19 ref cleanup)
  const measureRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    nodes.current.add(node);
    roRef.current?.observe(node);
    return () => {
      nodes.current.delete(node);
      roRef.current?.unobserve(node);
    };
  }, []);

  useEffect(() => () => endGesture.current?.(), []);

  // ---- derived view --------------------------------------------------------
  const elements = slide.document.elements;
  const view = useMemo(
    () =>
      preview
        ? elements.map((e) =>
            preview[e.id] ? ({ ...e, ...preview[e.id] } as SlideElement) : e,
          )
        : elements,
    [elements, preview],
  );
  const ordered = paintOrder(view);
  const selSet = new Set(selectedIds);
  const selectedView = view.filter((e) => selSet.has(e.id));
  const solo = selectedView.length === 1 ? selectedView[0] : null;
  const selBox = unionBox(selectedView.map((e) => boxOf(e, heights)));

  // keep on-canvas controls a constant screen size despite the stage scale
  const cs = scale > 0 ? 1 / scale : 1;
  const c = (px: number) => px * cs;

  const toStage = (clientX: number, clientY: number): Point => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
  };

  const stopEditing = useCallback(() => setEditing(null), []);

  // ---- gesture plumbing ----------------------------------------------------
  const begin = (
    kind: "move" | "resize" | "rotate" | "marquee",
    onMove: (e: PointerEvent) => void,
    onUp: (e: PointerEvent) => void,
  ) => {
    endGesture.current?.();
    const move = (e: PointerEvent) => onMove(e);
    const up = (e: PointerEvent) => {
      stop();
      onUp(e);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      endGesture.current = null;
      setGesture(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    endGesture.current = stop;
    setGesture(kind);
  };

  // drag the whole selection, snapping its bounds to the slide + other elements
  const startMove = (
    e: ReactPointerEvent,
    moving: SlideElement[],
    collapseTo: string[] | null,
  ) => {
    const sx = e.clientX;
    const sy = e.clientY;
    const s = scale;
    const ids = new Set(moving.map((m) => m.id));
    const bbox = unionBox(moving.map((m) => boxOf(m, heights)))!;
    const { xs, ys } = snapCandidates(
      elements.filter((el) => !ids.has(el.id)).map((el) => boxOf(el, heights)),
    );
    const thr = SNAP_PX / s;
    let started = false;
    let dx = 0;
    let dy = 0;
    const patchesFor = () =>
      Object.fromEntries(
        moving.map((m) => [m.id, { x: m.x + dx, y: m.y + dy }]),
      ) as Patches;

    begin(
      "move",
      (ev) => {
        const rx = ev.clientX - sx;
        const ry = ev.clientY - sy;
        if (!started && Math.hypot(rx, ry) < DRAG_THRESHOLD) return;
        started = true;
        let mx = rx / s;
        let my = ry / s;
        // Shift locks the drag to one axis
        let lockX = false;
        let lockY = false;
        if (ev.shiftKey) {
          if (Math.abs(mx) > Math.abs(my)) {
            my = 0;
            lockY = true;
          } else {
            mx = 0;
            lockX = true;
          }
        }
        const g: Guide[] = [];
        // Alt temporarily disables snapping
        if (!ev.altKey) {
          if (!lockX) {
            const l = bbox.x + mx;
            const r = snapAxis([l, l + bbox.w / 2, l + bbox.w], xs, thr);
            mx += r.off;
            r.hits.forEach((pos) => g.push({ axis: "x", pos }));
          }
          if (!lockY) {
            const t = bbox.y + my;
            const r = snapAxis([t, t + bbox.h / 2, t + bbox.h], ys, thr);
            my += r.off;
            r.hits.forEach((pos) => g.push({ axis: "y", pos }));
          }
        }
        // never lose the selection off the slide
        mx = clamp(mx, 24 - bbox.x - bbox.w, STAGE_WIDTH - 24 - bbox.x);
        my = clamp(my, 24 - bbox.y - bbox.h, STAGE_HEIGHT - 24 - bbox.y);
        dx = Math.round(mx);
        dy = Math.round(my);
        setPreview(patchesFor());
        setGuides(g);
      },
      () => {
        setGuides([]);
        setPreview(null);
        if (started && (dx || dy)) onCommitPatches(patchesFor());
        else if (!started && collapseTo) onSetSelection(collapseTo);
      },
    );
  };

  const pressElement = (e: ReactPointerEvent, id: string) => {
    const unit = expandGroups([id], elements);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    let next: string[];
    let collapse = false;
    if (additive) {
      // Shift/Ctrl-click toggles the element (or its group) in the selection
      const allIn = unit.every((u) => selSet.has(u));
      const rest = selectedIds.filter((x) => !unit.includes(x));
      next = allIn ? rest : [...rest, ...unit];
    } else if (selSet.has(id)) {
      // pressing inside the selection keeps it (to drag the group); a plain
      // click without dragging narrows it down to this element on release
      next = [...selectedIds.filter((x) => x !== id), id];
      collapse = selectedIds.length > unit.length;
    } else {
      next = unit;
    }
    onSetSelection(next);
    if (!next.includes(id)) return;
    const moving = elements.filter((el) => next.includes(el.id) && !el.locked);
    if (!moving.length) return;
    startMove(e, moving, collapse ? unit : null);
  };

  const startResize = (e: ReactPointerEvent, handle: Handle, el: SlideElement) => {
    e.stopPropagation();
    e.preventDefault();
    const b0 = boxOf(el, heights);
    const sx = e.clientX;
    const sy = e.clientY;
    const s = scale;
    const dirX = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
    const dirY = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
    const corner = dirX !== 0 && dirY !== 0;
    const isText = el.type === "text";
    const media = el.type === "image" || el.type === "video";
    const { xs, ys } = snapCandidates(
      elements.filter((o) => o.id !== el.id).map((o) => boxOf(o, heights)),
    );
    const thr = SNAP_PX / s;
    let patch: ElementPatch | null = null;

    begin(
      "resize",
      (ev) => {
        const dx = (ev.clientX - sx) / s;
        const dy = (ev.clientY - sy) / s;
        // corners keep proportions for text (scales the font) and media;
        // Shift flips that for images/videos/shapes
        const proportional = corner && (isText || media !== ev.shiftKey);
        let w = b0.w;
        let h = b0.h;
        const g: Guide[] = [];
        if (proportional) {
          const tw = b0.w + dirX * dx;
          const th = b0.h + dirY * dy;
          let k = (tw * b0.w + th * b0.h) / (b0.w * b0.w + b0.h * b0.h);
          k = Math.max(
            k,
            MIN_SIZE / Math.min(b0.w, b0.h),
            isText ? 6 / (el as TextElement).fontSize : 0,
          );
          w = b0.w * k;
          h = b0.h * k;
        } else {
          if (dirX) {
            w = b0.w + dirX * dx;
            if (!ev.altKey) {
              const edge = dirX > 0 ? b0.x + w : b0.x + b0.w - w;
              const r = snapAxis([edge], xs, thr);
              w += dirX * r.off;
              r.hits.forEach((pos) => g.push({ axis: "x", pos }));
            }
            w = Math.max(MIN_SIZE, w);
          }
          if (dirY) {
            h = b0.h + dirY * dy;
            if (!ev.altKey) {
              const edge = dirY > 0 ? b0.y + h : b0.y + b0.h - h;
              const r = snapAxis([edge], ys, thr);
              h += dirY * r.off;
              r.hits.forEach((pos) => g.push({ axis: "y", pos }));
            }
            h = Math.max(MIN_SIZE, h);
          }
        }
        const x = Math.round(dirX < 0 ? b0.x + b0.w - w : b0.x);
        const y = Math.round(dirY < 0 ? b0.y + b0.h - h : b0.y);
        if (el.type === "text") {
          if (proportional) {
            const k = w / b0.w;
            patch = {
              x,
              y,
              w: Math.round(w),
              fontSize: Math.max(6, Math.round(el.fontSize * k)),
              ...(el.letterSpacing
                ? { letterSpacing: Math.round(el.letterSpacing * k * 10) / 10 }
                : {}),
              ...(el.h ? { h: Math.round(h) } : {}),
            };
            setBadge(`${patch.fontSize}px text`);
          } else {
            patch = { x, w: Math.round(w) };
            setBadge(`${Math.round(w)} wide`);
          }
        } else {
          patch = { x, y, w: Math.round(w), h: Math.round(h) };
          setBadge(`${Math.round(w)} × ${Math.round(h)}`);
        }
        setPreview({ [el.id]: patch });
        setGuides(g);
      },
      () => {
        setPreview(null);
        setGuides([]);
        setBadge(null);
        if (patch) onCommitPatches({ [el.id]: patch });
      },
    );
  };

  // scale a multi-selection proportionally from the opposite corner
  const startGroupScale = (
    e: ReactPointerEvent,
    handle: Handle,
    members: SlideElement[],
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const gb = unionBox(members.map((m) => boxOf(m, heights)))!;
    const sx = e.clientX;
    const sy = e.clientY;
    const s = scale;
    const dirX = handle.includes("e") ? 1 : -1;
    const dirY = handle.includes("s") ? 1 : -1;
    const ax = dirX > 0 ? gb.x : gb.x + gb.w;
    const ay = dirY > 0 ? gb.y : gb.y + gb.h;
    let patches: Patches | null = null;

    begin(
      "resize",
      (ev) => {
        const tw = gb.w + (dirX * (ev.clientX - sx)) / s;
        const th = gb.h + (dirY * (ev.clientY - sy)) / s;
        const k = Math.max(
          0.05,
          (tw * gb.w + th * gb.h) / (gb.w * gb.w + gb.h * gb.h),
        );
        const next: Patches = {};
        for (const m of members) {
          const p: ElementPatch = {
            x: Math.round(ax + (m.x - ax) * k),
            y: Math.round(ay + (m.y - ay) * k),
            w: Math.max(4, Math.round(m.w * k)),
          };
          if (m.type === "text") {
            p.fontSize = Math.max(6, Math.round(m.fontSize * k));
            if (m.letterSpacing)
              p.letterSpacing = Math.round(m.letterSpacing * k * 10) / 10;
            if (m.h) p.h = Math.max(4, Math.round(m.h * k));
          } else {
            p.h = Math.max(4, Math.round(m.h * k));
          }
          next[m.id] = p;
        }
        patches = next;
        setPreview(next);
        setBadge(`${Math.round(gb.w * k)} × ${Math.round(gb.h * k)}`);
      },
      () => {
        setPreview(null);
        setBadge(null);
        if (patches) onCommitPatches(patches);
      },
    );
  };

  const startRotate = (e: ReactPointerEvent, el: SlideElement) => {
    e.stopPropagation();
    e.preventDefault();
    const b = boxOf(el, heights);
    const r = wrapRef.current!.getBoundingClientRect();
    const cx = r.left + (b.x + b.w / 2) * scale;
    const cy = r.top + (b.y + b.h / 2) * scale;
    let angle = el.rotation ?? 0;
    let changed = false;

    begin(
      "rotate",
      (ev) => {
        let a =
          Math.atan2(ev.clientY - cy, ev.clientX - cx) * (180 / Math.PI) + 90;
        a = ((a % 360) + 360) % 360;
        if (ev.shiftKey) a = Math.round(a / 15) * 15;
        else {
          // gently stick to the right angles
          const near = Math.round(a / 90) * 90;
          if (Math.abs(a - near) < 4) a = near;
        }
        angle = Math.round(a) % 360;
        changed = true;
        setPreview({ [el.id]: { rotation: angle } });
        setBadge(`${angle}°`);
      },
      () => {
        setPreview(null);
        setBadge(null);
        if (changed) onCommitPatches({ [el.id]: { rotation: angle } });
      },
    );
  };

  // rubber-band selection, started from empty slide space or the area around it
  const startMarquee = (e: ReactPointerEvent) => {
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const base = additive ? selectedIds : [];
    const sx = e.clientX;
    const sy = e.clientY;
    const p0 = toStage(sx, sy);
    const candidates = elements
      .filter((el) => !el.locked)
      .map((el) => ({ id: el.id, box: boxOf(el, heights) }));
    let started = false;
    let lastKey: string | null = null;

    begin(
      "marquee",
      (ev) => {
        if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_THRESHOLD)
          return;
        started = true;
        const p = toStage(ev.clientX, ev.clientY);
        const rect = {
          x: Math.min(p0.x, p.x),
          y: Math.min(p0.y, p.y),
          w: Math.abs(p.x - p0.x),
          h: Math.abs(p.y - p0.y),
        };
        setMarquee(rect);
        // touched elements are picked, except big ones the box sits entirely
        // inside (e.g. a card or blob behind the content)
        const hits = candidates
          .filter((cand) => intersects(rect, cand.box) && !contains(cand.box, rect))
          .map((cand) => cand.id);
        const next = expandGroups([...new Set([...base, ...hits])], elements);
        const key = next.join(",");
        if (key !== lastKey) {
          lastKey = key;
          onSetSelection(next);
        }
      },
      () => {
        setMarquee(null);
        if (!started && !additive) onSetSelection([]);
      },
    );
  };

  // ---- pointer / menu / keyboard / drop handlers ---------------------------
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest("[data-ui]")) return;
    setMenu(null);
    const node = t.closest<HTMLElement>("[data-el-id]");
    if (node) {
      const id = node.dataset.elId!;
      if (editing?.id === id) return; // let the caret / text selection work
      pressElement(e, id);
    } else {
      startMarquee(e);
    }
  };

  const onContextMenu = (e: ReactMouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-ui]")) return;
    if (editing && t.closest(`[data-el-id="${editing.id}"]`)) return;
    e.preventDefault();
    const node = t.closest<HTMLElement>("[data-el-id]");
    if (node) {
      const id = node.dataset.elId!;
      if (!selSet.has(id)) onSetSelection(expandGroups([id], elements));
    } else {
      onSetSelection([]);
    }
    setMenu({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e.target instanceof Node && document.getElementById("canvas-menu")?.contains(e.target))
        return;
      setMenu(null);
    };
    const closeNow = () => setMenu(null);
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("resize", closeNow);
    window.addEventListener("blur", closeNow);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("resize", closeNow);
      window.removeEventListener("blur", closeNow);
    };
  }, [menu]);

  // Escape closes the menu (capture phase, so it doesn't also deselect)
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setMenu(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [menu]);

  // Enter starts typing in the selected text box
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || editing) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(t.tagName) ||
          t.isContentEditable)
      )
        return;
      if (selectedIds.length !== 1) return;
      const el = elements.find((x) => x.id === selectedIds[0]);
      if (el?.type === "text" && !el.locked) {
        e.preventDefault();
        setEditing({ id: el.id, at: null });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, selectedIds, elements]);

  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!dropping) setDropping(true);
  };
  const onDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDropping(false);
    const files = [...e.dataTransfer.files].filter((f) =>
      /^(image|video)\//.test(f.type),
    );
    if (files.length && scale > 0) {
      const p = toStage(e.clientX, e.clientY);
      onDropFiles(files, {
        x: clamp(p.x, 0, STAGE_WIDTH),
        y: clamp(p.y, 0, STAGE_HEIGHT),
      });
    }
  };

  // ---- overlay pieces --------------------------------------------------------
  const handleStyle = (cursor: string): CSSProperties => ({
    position: "absolute",
    width: c(13),
    height: c(13),
    background: "#fff",
    border: `${c(2)}px solid ${ACCENT}`,
    borderRadius: c(3),
    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
    cursor,
    pointerEvents: "auto",
    touchAction: "none",
  });

  const handlePos = (b: Box, h: Handle): CSSProperties => ({
    left:
      (h.includes("w") ? b.x : h.includes("e") ? b.x + b.w : b.x + b.w / 2) -
      c(6.5),
    top:
      (h.includes("n") ? b.y : h.includes("s") ? b.y + b.h : b.y + b.h / 2) -
      c(6.5),
  });

  const showControls = gesture !== "move" && gesture !== "marquee";
  const hoverEl =
    hoverId && !selSet.has(hoverId) && !gesture
      ? view.find((e) => e.id === hoverId)
      : undefined;
  const movableSel = selectedView.filter((e) => !e.locked);
  const isOneUnit = selectionUnits(selectedView).length === 1;

  let soloControls: React.ReactNode = null;
  if (solo && showControls && editing?.id !== solo.id) {
    const b = boxOf(solo, heights);
    const small = Math.min(b.w, b.h) * scale < 40;
    const handles = (solo.type === "text" ? TEXT_HANDLES : ALL_HANDLES).filter(
      (h) => !small || h.length === 2,
    );
    const knobLeft = b.x + b.w / 2 - c(13);
    const delLeft = Math.max(b.x + b.w - c(26), knobLeft + c(34));
    soloControls = solo.locked ? (
      <div
        title="Locked — unlock it in the Arrange panel"
        style={{
          position: "absolute",
          left: b.x,
          top: b.y - c(30),
          fontSize: c(13),
          lineHeight: 1,
          padding: `${c(4)}px ${c(7)}px`,
          borderRadius: c(6),
          background: "#1c1407",
          color: "#fff",
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        🔒 Locked
      </div>
    ) : (
      <>
        {handles.map((h) => (
          <div
            key={h}
            data-ui
            onPointerDown={(e) => startResize(e, h, solo)}
            style={{ ...handleStyle(CURSORS[h]), ...handlePos(b, h) }}
          />
        ))}
        <div
          data-ui
          title="Rotate (hold Shift to snap)"
          onPointerDown={(e) => startRotate(e, solo)}
          style={{
            position: "absolute",
            top: b.y - c(42),
            left: knobLeft,
            width: c(26),
            height: c(26),
            borderRadius: "9999px",
            background: "#fff",
            border: `${c(2)}px solid ${ACCENT}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: c(15),
            color: ACCENT,
            cursor: "grab",
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            pointerEvents: "auto",
            touchAction: "none",
          }}
        >
          ⟳
        </div>
        <button
          data-ui
          title="Delete"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteElement(solo.id);
          }}
          style={{
            position: "absolute",
            top: b.y - c(42),
            left: delLeft,
            width: c(26),
            height: c(26),
            borderRadius: "9999px",
            background: "#e8420e",
            color: "#fff",
            border: `${c(2)}px solid #fff`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: c(16),
            lineHeight: 1,
            cursor: "pointer",
            boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
            pointerEvents: "auto",
          }}
        >
          ×
        </button>
      </>
    );
  }

  let groupControls: React.ReactNode = null;
  if (selectedView.length > 1 && selBox) {
    const gb = selBox;
    groupControls = (
      <>
        <div
          style={{
            position: "absolute",
            left: gb.x,
            top: gb.y,
            width: gb.w,
            height: gb.h,
            outline: `${c(2)}px ${isOneUnit ? "solid" : "dashed"} ${ACCENT}`,
            outlineOffset: c(5),
          }}
        />
        {showControls &&
          movableSel.length > 0 &&
          CORNERS.map((h) => (
            <div
              key={h}
              data-ui
              title="Drag to resize the selection"
              onPointerDown={(e) => startGroupScale(e, h, movableSel)}
              style={{
                ...handleStyle(CURSORS[h]),
                left:
                  (h.includes("w") ? gb.x - c(5) : gb.x + gb.w + c(5)) - c(6.5),
                top:
                  (h.includes("n") ? gb.y - c(5) : gb.y + gb.h + c(5)) - c(6.5),
              }}
            />
          ))}
      </>
    );
  }

  const menuItems: (
    | { label: string; hint?: string; run: () => void; disabled?: boolean }
    | "sep"
  )[] = [];
  if (menu) {
    const has = selectedIds.length > 0;
    const grouped = selectedView.some((e) => e.groupId);
    const allLocked = has && selectedView.every((e) => e.locked);
    if (has) {
      menuItems.push(
        { label: "Copy", hint: "Ctrl+C", run: actions.copy },
        { label: "Cut", hint: "Ctrl+X", run: actions.cut },
      );
    }
    menuItems.push({
      label: "Paste",
      hint: "Ctrl+V",
      run: actions.paste,
      disabled: !actions.canPaste,
    });
    if (has) {
      menuItems.push(
        { label: "Duplicate", hint: "Ctrl+D", run: actions.duplicate },
        { label: "Delete", hint: "Del", run: actions.remove },
        "sep",
        { label: "Bring to front", hint: "Ctrl+Shift+]", run: () => actions.layer("front") },
        { label: "Bring forward", hint: "Ctrl+]", run: () => actions.layer("forward") },
        { label: "Send backward", hint: "Ctrl+[", run: () => actions.layer("backward") },
        { label: "Send to back", hint: "Ctrl+Shift+[", run: () => actions.layer("back") },
        "sep",
      );
      if (selectedIds.length > 1 && !isOneUnit)
        menuItems.push({ label: "Group", hint: "Ctrl+G", run: actions.group });
      if (grouped)
        menuItems.push({ label: "Ungroup", hint: "Ctrl+Shift+G", run: actions.ungroup });
      menuItems.push({ label: allLocked ? "Unlock" : "Lock", run: actions.toggleLock });
    } else {
      menuItems.push({ label: "Select all", hint: "Ctrl+A", run: actions.selectAll });
    }
  }
  const menuH = menuItems.reduce((h, it) => h + (it === "sep" ? 9 : 32), 12);

  return (
    <section
      className="thin-scroll relative flex flex-1 select-none items-center justify-center overflow-auto bg-sigma-sand p-6"
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setDropping(false);
      }}
      onDrop={onDrop}
      style={{ touchAction: "none" }}
    >
      <EditingHereBadge names={othersHere} />
      <div
        ref={wrapRef}
        className="relative w-full max-w-[1000px]"
        style={{ aspectRatio: `${STAGE_WIDTH} / ${STAGE_HEIGHT}` }}
      >
        {/* the slide itself (clipped) */}
        <div
          className={`absolute inset-0 overflow-hidden rounded-2xl bg-white shadow-slide transition-shadow ${
            dropping ? "ring-4 ring-sigma-orange/50" : ""
          }`}
        >
          {scale > 0 && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: STAGE_WIDTH,
                height: STAGE_HEIGHT,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              <StageBackground bg={slide.document.background} />
              {ordered.map((el) => {
                const isText = el.type === "text";
                const isEditing = editing?.id === el.id;
                return (
                  <div
                    key={el.id}
                    data-el-id={el.id}
                    ref={measureRef}
                    onPointerEnter={() => setHoverId(el.id)}
                    onPointerLeave={() =>
                      setHoverId((h) => (h === el.id ? null : h))
                    }
                    onDoubleClick={(ev) => {
                      if (isText && !el.locked) {
                        onSetSelection([el.id]);
                        setEditing({
                          id: el.id,
                          at: { x: ev.clientX, y: ev.clientY },
                        });
                      }
                    }}
                    style={{
                      position: "absolute",
                      left: el.x,
                      top: el.y,
                      width: el.w,
                      height: isText ? (el.h ?? "auto") : el.h,
                      zIndex: el.z ?? 1,
                      cursor: isEditing ? "text" : el.locked ? "default" : "move",
                      userSelect: isEditing ? "text" : "none",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        transform: el.rotation
                          ? `rotate(${el.rotation}deg)`
                          : undefined,
                        transformOrigin: "center",
                        pointerEvents: isEditing ? "auto" : "none",
                      }}
                    >
                      <ElementBody
                        el={el}
                        editing={isEditing}
                        caretAt={isEditing ? editing.at : null}
                        onInput={(text) => onUpdateElement(el.id, { text })}
                        onStopEditing={stopEditing}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* selection overlay — unclipped so handles near the edges stay usable */}
        {scale > 0 && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: STAGE_WIDTH,
              height: STAGE_HEIGHT,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              pointerEvents: "none",
              zIndex: 20,
            }}
          >
            {hoverEl && (
              <div
                style={{
                  position: "absolute",
                  ...boxStyle(boxOf(hoverEl, heights)),
                  outline: `${c(1.5)}px solid rgba(244,105,30,0.55)`,
                  outlineOffset: c(2),
                }}
              />
            )}

            {selectedView.map((el) => (
              <div
                key={el.id}
                style={{
                  position: "absolute",
                  ...boxStyle(boxOf(el, heights)),
                  outline: solo
                    ? `${c(2)}px solid ${ACCENT}`
                    : `${c(1.5)}px solid rgba(244,105,30,0.7)`,
                  outlineOffset: c(2),
                }}
              />
            ))}

            {groupControls}
            {soloControls}

            {guides.map((g, i) => (
              <div
                key={i}
                style={
                  g.axis === "x"
                    ? {
                        position: "absolute",
                        left: g.pos - c(0.5),
                        top: 0,
                        width: c(1),
                        height: STAGE_HEIGHT,
                        background: GUIDE,
                      }
                    : {
                        position: "absolute",
                        top: g.pos - c(0.5),
                        left: 0,
                        height: c(1),
                        width: STAGE_WIDTH,
                        background: GUIDE,
                      }
                }
              />
            ))}

            {marquee && (
              <div
                style={{
                  position: "absolute",
                  ...boxStyle(marquee),
                  border: `${c(1)}px solid ${ACCENT}`,
                  background: "rgba(244,105,30,0.08)",
                }}
              />
            )}

            {badge && selBox && (
              <div
                style={{
                  position: "absolute",
                  left: selBox.x + selBox.w / 2,
                  top: selBox.y + selBox.h + c(16),
                  transform: "translateX(-50%)",
                  fontSize: c(12),
                  lineHeight: 1,
                  padding: `${c(5)}px ${c(8)}px`,
                  borderRadius: c(6),
                  background: "#1c1407",
                  color: "#fff",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {badge}
              </div>
            )}
          </div>
        )}

        {/* floating quick-edit toolbar for the current selection */}
        {scale > 0 && selBox && selectedView.length > 0 && !gesture && (
          <QuickBar
            key={selectedIds.join(",")}
            els={selectedView}
            box={selBox}
            scale={scale}
            aboveGap={
              solo ? (solo.locked ? 40 : 52) : selectedView.length > 1 ? 20 : 16
            }
            actions={actions}
            onUpdateElements={onUpdateElements}
            onOpenMenu={(x, y) => setMenu({ x, y })}
          />
        )}
      </div>

      {menu && (
        <div
          id="canvas-menu"
          data-ui
          className="fixed z-50 min-w-[220px] rounded-xl border border-sigma-ink/10 bg-white py-1.5 text-sm shadow-card"
          style={{
            left: Math.min(menu.x, window.innerWidth - 232),
            top: Math.max(8, Math.min(menu.y, window.innerHeight - menuH - 8)),
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {menuItems.map((it, i) =>
            it === "sep" ? (
              <div key={i} className="my-1 border-t border-sigma-ink/10" />
            ) : (
              <button
                key={i}
                disabled={it.disabled}
                onClick={() => {
                  setMenu(null);
                  it.run();
                }}
                className="flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left font-medium text-sigma-ink transition hover:bg-sigma-sand disabled:opacity-35 disabled:hover:bg-transparent"
              >
                <span>{it.label}</span>
                {it.hint && (
                  <span className="text-xs text-sigma-ink/40">{it.hint}</span>
                )}
              </button>
            ),
          )}
        </div>
      )}
    </section>
  );
}

function boxStyle(b: Box): CSSProperties {
  return { left: b.x, top: b.y, width: b.w, height: b.h };
}
