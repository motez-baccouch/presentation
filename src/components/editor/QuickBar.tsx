"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  SlideElement,
  TextElement,
  ShapeElement,
  ImageElement,
  VideoElement,
  FONT_OPTIONS,
  STAGE_WIDTH,
  STAGE_HEIGHT,
} from "@/lib/types";
import { Box, clamp, selectionUnits } from "./geometry";
import type { EditorActions, ElementPatch, Patches } from "./actions";
import { ALIGNS, AlignIcon, ColorRow, btn } from "./Inspector";

// Canva-style floating toolbar: appears next to the selection with the most
// common quick edits for whatever kind of element is selected.

const item =
  "flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-sm font-semibold text-sigma-ink transition hover:bg-sigma-sand";
const itemOn =
  "flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-lg bg-sigma-orange/10 px-2 text-sm font-semibold text-sigma-orange";
const popLabel =
  "mb-1.5 text-[11px] font-bold uppercase tracking-wider text-sigma-ink/40";

type Pop = "color" | "style" | "position" | null;

function Sep() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-sigma-ink/10" />;
}

/** The value every element shares, else undefined. */
function common<T>(els: SlideElement[], get: (e: SlideElement) => T): T | undefined {
  const first = get(els[0]);
  return els.every((e) => get(e) === first) ? first : undefined;
}

function TextAlignIcon({ align }: { align: TextElement["align"] }) {
  const xs =
    align === "left"
      ? [2, 2, 2]
      : align === "center"
        ? [2, 4, 3]
        : [2, 6, 4];
  const ws = [12, 8, 10];
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden>
      {[3, 7, 11].map((y, i) => (
        <rect key={y} x={xs[i]} y={y} width={ws[i]} height="1.8" rx="0.9" />
      ))}
    </svg>
  );
}

function SizeInput({
  value,
  onCommit,
}: {
  value: number | undefined;
  onCommit: (n: number) => void;
}) {
  // applied on Enter / blur so typing "16" doesn't flash size 1 first
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) {
      const n = Number(draft);
      if (draft.trim() && Number.isFinite(n) && n >= 1) onCommit(Math.round(n));
    }
    setDraft(null);
  };
  return (
    <input
      inputMode="numeric"
      title="Font size (↑/↓ to step)"
      placeholder="–"
      value={draft ?? (value !== undefined ? String(value) : "")}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && value !== undefined) {
          e.preventDefault();
          setDraft(null);
          onCommit(Math.max(1, value + (e.key === "ArrowUp" ? 1 : -1)));
        }
      }}
      className="h-8 w-11 shrink-0 rounded-lg border border-sigma-ink/15 bg-white text-center text-sm font-semibold text-sigma-ink outline-none focus:ring-2 focus:ring-sigma-orange/40"
    />
  );
}

export function QuickBar({
  els,
  box,
  scale,
  aboveGap,
  actions,
  onUpdateElements,
  onOpenMenu,
}: {
  /** selected elements; the last one is the primary */
  els: SlideElement[];
  /** selection bounds in stage pixels */
  box: Box;
  scale: number;
  /** screen px to keep clear above the selection (rotate knob etc.) */
  aboveGap: number;
  actions: EditorActions;
  onUpdateElements: (patches: Patches) => void;
  onOpenMenu: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 42 });
  const [pop, setPop] = useState<Pop>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const ro = new ResizeObserver(() =>
      setSize({ w: node.offsetWidth, h: node.offsetHeight }),
    );
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // close an open popover on outside click / Escape (without deselecting)
  useEffect(() => {
    if (!pop) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setPop(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setPop(null);
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", esc, true);
    };
  }, [pop]);

  // below the selection when there's room, else above it, else inside its top
  const wrapW = STAGE_WIDTH * scale;
  const wrapH = STAGE_HEIGHT * scale;
  const gap = 16;
  const top0 = box.y * scale;
  const bottom0 = (box.y + box.h) * scale;
  let top: number;
  let above = false;
  if (bottom0 + gap + size.h <= wrapH + 20) top = bottom0 + gap;
  else if (top0 - aboveGap - size.h >= -20) {
    top = top0 - aboveGap - size.h;
    above = true;
  } else top = Math.max(8, top0 + 8);
  const left = clamp(
    (box.x + box.w / 2) * scale - size.w / 2,
    0,
    Math.max(0, wrapW - size.w),
  );

  const patchEach = (fn: (e: SlideElement) => ElementPatch) =>
    onUpdateElements(Object.fromEntries(els.map((e) => [e.id, fn(e)])));
  const patchAll = (p: ElementPatch) => patchEach(() => p);
  const toggle = (name: Exclude<Pop, null>) =>
    setPop((p) => (p === name ? null : name));

  const popover = (children: ReactNode, wide = false) => (
    <div
      className={`absolute left-1/2 z-10 -translate-x-1/2 rounded-xl border border-sigma-ink/10 bg-white p-3 shadow-card ${
        above ? "bottom-full mb-2" : "top-full mt-2"
      } ${wide ? "w-[236px]" : "w-[220px]"}`}
    >
      {children}
    </div>
  );

  const primary = els[els.length - 1];
  const type = common(els, (e) => e.type);
  const locked = els.every((e) => e.locked);
  const units = selectionUnits(els).length;
  const grouped = els.some((e) => e.groupId);

  const colorButton = (color: string, kind: "text" | "fill", onPick: (c: string) => void) => (
    <div className="relative">
      <button
        className={pop === "color" ? itemOn : item}
        title={kind === "text" ? "Text colour" : "Fill colour"}
        onClick={() => toggle("color")}
      >
        {kind === "text" ? (
          <span className="flex flex-col items-center leading-none">
            <span className="text-[15px] font-bold">A</span>
            <span
              className="mt-0.5 h-[3px] w-4 rounded-full ring-1 ring-sigma-ink/15"
              style={{ background: color }}
            />
          </span>
        ) : (
          <span
            className="h-5 w-5 rounded-full ring-1 ring-sigma-ink/15"
            style={{ background: color }}
          />
        )}
      </button>
      {pop === "color" &&
        popover(
          <>
            <div className={popLabel}>{kind === "text" ? "Text colour" : "Fill"}</div>
            <ColorRow value={color} onChange={onPick} />
          </>,
          true,
        )}
    </div>
  );

  let tools: ReactNode;
  if (locked) {
    tools = (
      <button className={item} onClick={actions.toggleLock} title="Unlock to edit">
        🔒 Unlock
      </button>
    );
  } else if (type === "text") {
    const texts = els as TextElement[];
    const p = primary as TextElement;
    const font = common(els, (e) => (e as TextElement).fontFamily) ?? "";
    const bold = texts.every((e) => e.fontWeight >= 700);
    const italic = texts.every((e) => e.italic);
    const upper = texts.every((e) => e.uppercase);
    const align = (common(els, (e) => (e as TextElement).align) ?? p.align) as TextElement["align"];
    const nextAlign = align === "left" ? "center" : align === "center" ? "right" : "left";
    tools = (
      <>
        <select
          value={font}
          title="Font"
          onChange={(e) => patchAll({ fontFamily: e.target.value })}
          className="h-8 w-[104px] shrink-0 rounded-lg border border-sigma-ink/15 bg-white px-1.5 text-sm text-sigma-ink"
        >
          {!font && <option value="">Mixed</option>}
          {FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <Sep />
        <button
          className={item}
          title="Smaller"
          onClick={() =>
            patchEach((e) => ({ fontSize: Math.max(6, (e as TextElement).fontSize - 2) }))
          }
        >
          −
        </button>
        <SizeInput
          value={common(els, (e) => (e as TextElement).fontSize)}
          onCommit={(n) => patchAll({ fontSize: n })}
        />
        <button
          className={item}
          title="Bigger"
          onClick={() => patchEach((e) => ({ fontSize: (e as TextElement).fontSize + 2 }))}
        >
          +
        </button>
        <Sep />
        {colorButton(p.color, "text", (c) => patchAll({ color: c }))}
        <button
          className={bold ? itemOn : item}
          title="Bold"
          onClick={() => patchAll({ fontWeight: bold ? 400 : 700 })}
        >
          <b>B</b>
        </button>
        <button
          className={italic ? itemOn : item}
          title="Italic"
          onClick={() => patchAll({ italic: !italic })}
        >
          <i className="font-serif">I</i>
        </button>
        <button
          className={upper ? itemOn : item}
          title="Uppercase"
          onClick={() => patchAll({ uppercase: !upper })}
        >
          AA
        </button>
        <button
          className={item}
          title={`Text alignment: ${align} (click for ${nextAlign})`}
          onClick={() => patchAll({ align: nextAlign })}
        >
          <TextAlignIcon align={align} />
        </button>
      </>
    );
  } else if (type === "shape") {
    const p = primary as ShapeElement;
    const opacity = Math.round((p.opacity ?? 1) * 100);
    const rounded = p.kind === "rect" || p.kind === "line";
    tools = (
      <>
        {colorButton(p.fill, "fill", (c) => patchAll({ fill: c }))}
        <div className="relative">
          <button
            className={pop === "style" ? itemOn : item}
            title="Transparency & corners"
            onClick={() => toggle("style")}
          >
            <span aria-hidden>◐</span> {opacity}%
          </button>
          {pop === "style" &&
            popover(
              <>
                <div className={popLabel}>Opacity · {opacity}%</div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={opacity}
                  onChange={(e) => patchAll({ opacity: Number(e.target.value) / 100 })}
                  className="mb-2 w-full accent-sigma-orange"
                />
                {rounded && (
                  <>
                    <div className={popLabel}>Corners · {p.radius ?? 0}</div>
                    <input
                      type="range"
                      min={0}
                      max={120}
                      value={p.radius ?? 0}
                      onChange={(e) => patchAll({ radius: Number(e.target.value) })}
                      className="w-full accent-sigma-orange"
                    />
                  </>
                )}
              </>,
            )}
        </div>
      </>
    );
  } else if (type === "image") {
    const imgs = els as ImageElement[];
    const cover = imgs.every((e) => (e.fit ?? "cover") === "cover");
    const circle = imgs.every((e) => e.circle);
    const shadow = imgs.every((e) => e.shadow);
    tools = (
      <>
        <button
          className={item}
          title="Crop to fill the frame, or fit the whole picture"
          onClick={() => patchAll({ fit: cover ? "contain" : "cover" })}
        >
          {cover ? "Fill" : "Fit"}
        </button>
        <button
          className={circle ? itemOn : item}
          title="Circle"
          onClick={() => patchAll({ circle: !circle })}
        >
          ◯ Circle
        </button>
        <button
          className={shadow ? itemOn : item}
          title="Shadow"
          onClick={() => patchAll({ shadow: !shadow })}
        >
          Shadow
        </button>
      </>
    );
  } else if (type === "video") {
    const vids = els as VideoElement[];
    const flag = (k: "autoplay" | "loop" | "muted") => vids.every((e) => e[k] ?? true);
    tools = (
      <>
        {(["autoplay", "loop", "muted"] as const).map((k) => (
          <button
            key={k}
            className={flag(k) ? itemOn : item}
            onClick={() => patchAll({ [k]: !flag(k) })}
          >
            {k === "autoplay" ? "Autoplay" : k === "loop" ? "Loop" : "Muted"}
          </button>
        ))}
      </>
    );
  } else {
    // a mix of kinds: the most useful thing is to group them
    tools = (
      <>
        <span className="shrink-0 px-2 text-sm font-semibold text-sigma-ink/50">
          {els.length} selected
        </span>
        {units > 1 ? (
          <button className={item} title="Ctrl+G" onClick={actions.group}>
            Group
          </button>
        ) : grouped ? (
          <button className={item} title="Ctrl+Shift+G" onClick={actions.ungroup}>
            Ungroup
          </button>
        ) : null}
      </>
    );
  }

  return (
    <div
      ref={ref}
      data-ui
      // keep focus (and inline text editing) where it is when clicking buttons
      onMouseDown={(e) => {
        if (!(e.target as HTMLElement).closest("input, select")) e.preventDefault();
      }}
      className="absolute z-30 flex items-center gap-0.5 whitespace-nowrap rounded-xl border border-sigma-ink/10 bg-white px-1.5 py-1 shadow-card"
      style={{ left, top, visibility: size.w ? "visible" : "hidden" }}
    >
      {tools}
      <Sep />
      {!locked && (
        <div className="relative">
          <button
            className={pop === "position" ? itemOn : item}
            title="Align & layer"
            onClick={() => toggle("position")}
          >
            Position
          </button>
          {pop === "position" &&
            popover(
              <>
                <div className={popLabel}>
                  Align {units > 1 ? "to each other" : "on the slide"}
                </div>
                <div className="mb-3 grid grid-cols-6 gap-1">
                  {ALIGNS.map((a) => (
                    <button
                      key={a.edge}
                      title={a.label}
                      aria-label={a.label}
                      onClick={() => actions.align(a.edge)}
                      className={`${btn} grid place-items-center px-0`}
                    >
                      <AlignIcon edge={a.edge} />
                    </button>
                  ))}
                </div>
                <div className={popLabel}>Layer</div>
                <div className="grid grid-cols-2 gap-1">
                  <button onClick={() => actions.layer("front")} className={btn}>
                    ⇈ To front
                  </button>
                  <button onClick={() => actions.layer("forward")} className={btn}>
                    ↑ Forward
                  </button>
                  <button onClick={() => actions.layer("backward")} className={btn}>
                    ↓ Backward
                  </button>
                  <button onClick={() => actions.layer("back")} className={btn}>
                    ⇊ To back
                  </button>
                </div>
              </>,
            )}
        </div>
      )}
      <button className={item} title="Duplicate (Ctrl+D)" onClick={actions.duplicate}>
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <rect x="5" y="5" width="9" height="9" rx="2" />
          <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
        </svg>
      </button>
      <button
        className={`${item} hover:text-sigma-red`}
        title="Delete (Del)"
        onClick={actions.remove}
      >
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
          <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4M6.8 6.8v4M9.2 6.8v4" />
        </svg>
      </button>
      <button
        className={item}
        title="More"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onOpenMenu(r.left, r.bottom + 6);
        }}
      >
        ⋯
      </button>
    </div>
  );
}
