"use client";

import { useRef, useState } from "react";
import {
  SlideData,
  SlideElement,
  TextElement,
  ImageElement,
  VideoElement,
  ShapeElement,
  SlideBackground,
  FONT_OPTIONS,
  COLOR_SWATCHES,
} from "@/lib/types";
import { genId } from "@/lib/templates";
import { selectionUnits } from "./geometry";
import type { AlignEdge, EditorActions, ElementPatch, Patches } from "./actions";
import { uploadFile } from "./media";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-sigma-ink/10 px-4 py-4">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-sigma-ink/40">
        {title}
      </h3>
      {children}
    </div>
  );
}

function ColorRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {COLOR_SWATCHES.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`h-6 w-6 rounded-full border ${
            value.toLowerCase() === c.toLowerCase()
              ? "ring-2 ring-sigma-orange ring-offset-1"
              : "border-sigma-ink/15"
          }`}
          style={{ background: c }}
          title={c}
        />
      ))}
      <input
        type="color"
        value={value.startsWith("#") ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-6 cursor-pointer rounded border border-sigma-ink/15 bg-transparent p-0"
        title="Custom colour"
      />
    </div>
  );
}

const btn =
  "rounded-lg border border-sigma-ink/15 bg-white px-2.5 py-1.5 text-xs font-semibold text-sigma-ink transition hover:bg-sigma-sand";
const btnActive =
  "rounded-lg border border-sigma-orange bg-sigma-orange/10 px-2.5 py-1.5 text-xs font-semibold text-sigma-orange";
const deleteBtn =
  "w-full rounded-lg border border-sigma-red/30 py-1.5 text-xs font-semibold text-sigma-red transition hover:bg-sigma-red/5";

export function Inspector({
  slide,
  selected,
  primary,
  actions,
  onUpdateElement,
  onUpdateElements,
  onDeleteElement,
  onAddElement,
  onAddFiles,
  onSetBackground,
}: {
  slide: SlideData;
  /** every selected element */
  selected: SlideElement[];
  /** the most recently selected one (drives single-element panels) */
  primary: SlideElement | null;
  actions: EditorActions;
  onUpdateElement: (id: string, patch: ElementPatch) => void;
  onUpdateElements: (patches: Patches) => void;
  onDeleteElement: (id: string) => void;
  onAddElement: (el: SlideElement) => void;
  onAddFiles: (files: File[]) => Promise<void>;
  onSetBackground: (bg: SlideBackground) => void;
}) {
  const fileAdd = useRef<HTMLInputElement>(null);
  const fileReplace = useRef<HTMLInputElement>(null);
  const fileVideo = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string>("");

  const single = selected.length === 1 ? primary : null;
  const sameType =
    selected.length && selected.every((e) => e.type === selected[0].type)
      ? selected[0].type
      : null;
  // panels edit the primary element; with a multi-selection of one kind, the
  // change is applied to every selected element of that kind
  const panelEl =
    primary && primary.type === sameType ? primary : (selected[0] ?? null);
  const patchSelected = (p: ElementPatch) =>
    onUpdateElements(Object.fromEntries(selected.map((e) => [e.id, p])));
  const removeSelected = () =>
    single ? onDeleteElement(single.id) : actions.remove();

  async function addFiles(files: File[], kind: string) {
    setBusy(kind);
    try {
      await onAddFiles(files);
    } finally {
      setBusy("");
    }
  }

  async function replaceImage(file: File) {
    if (!single || single.type !== "image") return;
    setBusy("upload");
    const url = await uploadFile(file);
    setBusy("");
    if (url) onUpdateElement(single.id, { url });
  }

  async function fixGrammar() {
    if (!single || single.type !== "text") return;
    setBusy("ai");
    const res = await fetch("/api/ai/grammar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: single.text }),
    });
    setBusy("");
    if (res.ok) {
      const { text } = await res.json();
      onUpdateElement(single.id, { text });
    }
  }

  async function rewrite(instruction: string) {
    if (!single || single.type !== "text" || !instruction.trim()) return;
    setBusy("ai");
    const res = await fetch("/api/ai/rewrite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: single.text, instruction }),
    });
    setBusy("");
    if (res.ok) {
      const { text } = await res.json();
      onUpdateElement(single.id, { text });
    }
  }

  function addText() {
    onAddElement({
      id: genId(),
      type: "text",
      text: "New text",
      role: "body",
      x: 120,
      y: 120,
      w: 460,
      fontFamily: "var(--font-sans)",
      fontSize: 32,
      fontWeight: 500,
      color: "#1c1407",
      align: "left",
      lineHeight: 1.3,
      anim: "up",
      z: 8,
    });
  }

  function addShape() {
    onAddElement({
      id: genId(),
      type: "shape",
      kind: "rect",
      x: 160,
      y: 160,
      w: 240,
      h: 180,
      fill: "#fbbf09",
      radius: 18,
      anim: "fade",
      z: 2,
    });
  }

  const bg = slide.document.background;
  const count = selected.length;

  return (
    <aside className="thin-scroll w-72 shrink-0 overflow-y-auto border-l border-sigma-ink/10 bg-white">
      {/* add */}
      <Section title="Add to slide">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={addText} className={btn}>
            + Text
          </button>
          <button onClick={() => fileAdd.current?.click()} className={btn}>
            {busy === "image" ? "Uploading…" : "+ Image"}
          </button>
          <button onClick={() => fileVideo.current?.click()} className={btn}>
            {busy === "video" ? "Uploading…" : "+ Video"}
          </button>
          <button onClick={addShape} className={btn}>
            + Box
          </button>
        </div>
        <input
          ref={fileAdd}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            if (files.length) addFiles(files, "image");
            e.target.value = "";
          }}
        />
        <input
          ref={fileVideo}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            if (files.length) addFiles(files, "video");
            e.target.value = "";
          }}
        />
      </Section>

      {/* element properties */}
      {!count && (
        <Section title="Tip">
          <ul className="space-y-1.5 text-xs leading-relaxed text-sigma-ink/55">
            <li>Click an element to edit it. Double-click text (or press Enter) to type.</li>
            <li>
              <b>Select several:</b> Shift-click, or drag a box around them on
              an empty spot.
            </li>
            <li>Drag to move — it snaps to the slide and other elements (hold Alt to stop snapping, Shift to keep it straight).</li>
            <li>Arrow keys nudge (Shift = 10px). Right-click for more.</li>
            <li>Drop or paste images straight onto the slide.</li>
          </ul>
        </Section>
      )}

      {panelEl?.type === "text" && sameType === "text" && (
        <TextProps
          key={single ? panelEl.id : "multi-text"}
          el={panelEl}
          count={count}
          busy={busy}
          onChange={patchSelected}
          onFix={fixGrammar}
          onRewrite={rewrite}
          onDelete={removeSelected}
        />
      )}

      {panelEl?.type === "image" && sameType === "image" && (
        <ImageProps
          el={panelEl}
          count={count}
          busy={busy}
          onChange={patchSelected}
          onReplace={() => fileReplace.current?.click()}
          onDelete={removeSelected}
        />
      )}
      <input
        ref={fileReplace}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) replaceImage(f);
          e.target.value = "";
        }}
      />

      {panelEl?.type === "video" && sameType === "video" && (
        <VideoProps
          el={panelEl}
          count={count}
          onChange={patchSelected}
          onDelete={removeSelected}
        />
      )}

      {panelEl?.type === "shape" && sameType === "shape" && (
        <ShapeProps
          el={panelEl}
          count={count}
          onChange={patchSelected}
          onDelete={removeSelected}
        />
      )}

      {count > 0 && !sameType && (
        <Section title="Selection">
          <p className="mb-3 text-xs text-sigma-ink/55">
            {count} elements selected. Drag any of them to move them all, or
            drag a corner of the frame to resize them together.
          </p>
          <button onClick={actions.remove} className={deleteBtn}>
            Delete {count} elements
          </button>
        </Section>
      )}

      {count > 0 && (
        <ArrangeSection
          selected={selected}
          single={single}
          actions={actions}
          onPatchOne={(p) => single && onUpdateElement(single.id, p)}
          onPatchAll={patchSelected}
        />
      )}

      {/* background */}
      <Section title="Slide background">
        <div className="mb-3 flex gap-2">
          {(["solid", "gradient", "mesh"] as const).map((k) => (
            <button
              key={k}
              onClick={() =>
                onSetBackground(
                  k === "solid"
                    ? { kind: "solid", color: bg.color ?? "#fff8ea" }
                    : k === "gradient"
                      ? {
                          kind: "gradient",
                          from: bg.from ?? "#f79009",
                          to: bg.to ?? "#e8420e",
                          angle: bg.angle ?? 135,
                        }
                      : { kind: "mesh" },
                )
              }
              className={bg.kind === k ? btnActive : btn}
            >
              {k}
            </button>
          ))}
        </div>
        {bg.kind === "solid" && (
          <ColorRow
            value={bg.color ?? "#fff8ea"}
            onChange={(c) => onSetBackground({ kind: "solid", color: c })}
          />
        )}
        {bg.kind === "gradient" && (
          <div className="space-y-2">
            <div>
              <span className="mb-1 block text-xs text-sigma-ink/50">From</span>
              <ColorRow
                value={bg.from ?? "#f79009"}
                onChange={(c) =>
                  onSetBackground({ ...bg, kind: "gradient", from: c })
                }
              />
            </div>
            <div>
              <span className="mb-1 block text-xs text-sigma-ink/50">To</span>
              <ColorRow
                value={bg.to ?? "#e8420e"}
                onChange={(c) =>
                  onSetBackground({ ...bg, kind: "gradient", to: c })
                }
              />
            </div>
          </div>
        )}
      </Section>
    </aside>
  );
}

// ---- arrange: align / distribute / layers / group / lock / exact geometry ----

const ALIGNS: { edge: AlignEdge; label: string }[] = [
  { edge: "left", label: "Align left" },
  { edge: "hcenter", label: "Align centre" },
  { edge: "right", label: "Align right" },
  { edge: "top", label: "Align top" },
  { edge: "vcenter", label: "Align middle" },
  { edge: "bottom", label: "Align bottom" },
];

function AlignIcon({ edge }: { edge: AlignEdge | "dh" | "dv" }) {
  const bar = "currentColor";
  const shapes: Record<typeof edge, React.ReactNode> = {
    left: (
      <>
        <rect x="1.5" y="1" width="1.5" height="14" />
        <rect x="4.5" y="3" width="10" height="3.5" rx="1" />
        <rect x="4.5" y="9.5" width="6" height="3.5" rx="1" />
      </>
    ),
    hcenter: (
      <>
        <rect x="7.25" y="1" width="1.5" height="14" />
        <rect x="2" y="3" width="12" height="3.5" rx="1" />
        <rect x="4.5" y="9.5" width="7" height="3.5" rx="1" />
      </>
    ),
    right: (
      <>
        <rect x="13" y="1" width="1.5" height="14" />
        <rect x="1.5" y="3" width="10" height="3.5" rx="1" />
        <rect x="5.5" y="9.5" width="6" height="3.5" rx="1" />
      </>
    ),
    top: (
      <>
        <rect x="1" y="1.5" width="14" height="1.5" />
        <rect x="3" y="4.5" width="3.5" height="10" rx="1" />
        <rect x="9.5" y="4.5" width="3.5" height="6" rx="1" />
      </>
    ),
    vcenter: (
      <>
        <rect x="1" y="7.25" width="14" height="1.5" />
        <rect x="3" y="2" width="3.5" height="12" rx="1" />
        <rect x="9.5" y="4.5" width="3.5" height="7" rx="1" />
      </>
    ),
    bottom: (
      <>
        <rect x="1" y="13" width="14" height="1.5" />
        <rect x="3" y="1.5" width="3.5" height="10" rx="1" />
        <rect x="9.5" y="5.5" width="3.5" height="6" rx="1" />
      </>
    ),
    dh: (
      <>
        <rect x="1" y="3" width="3" height="10" rx="1" />
        <rect x="6.5" y="5" width="3" height="6" rx="1" />
        <rect x="12" y="3" width="3" height="10" rx="1" />
      </>
    ),
    dv: (
      <>
        <rect x="3" y="1" width="10" height="3" rx="1" />
        <rect x="5" y="6.5" width="6" height="3" rx="1" />
        <rect x="3" y="12" width="10" height="3" rx="1" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill={bar} aria-hidden>
      {shapes[edge]}
    </svg>
  );
}

function NumField({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  // keep the raw text while typing so "-" or "" don't get snapped back
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex items-center gap-1.5 rounded-lg border border-sigma-ink/15 px-2 py-1 focus-within:ring-2 focus-within:ring-sigma-orange/40">
      <span className="text-[10px] font-bold uppercase text-sigma-ink/40">
        {label}
      </span>
      <input
        inputMode="numeric"
        value={draft ?? String(Math.round(value))}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isFinite(n))
            onChange(Math.round(min !== undefined ? Math.max(min, n) : n));
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="w-full min-w-0 bg-transparent text-sm outline-none"
      />
    </label>
  );
}

const ANIMS: { value: NonNullable<SlideElement["anim"]>; label: string }[] = [
  { value: "up", label: "Rise up" },
  { value: "fade", label: "Fade in" },
  { value: "left", label: "Slide from left" },
  { value: "right", label: "Slide from right" },
  { value: "pop", label: "Pop" },
  { value: "none", label: "No animation" },
];

function ArrangeSection({
  selected,
  single,
  actions,
  onPatchOne,
  onPatchAll,
}: {
  selected: SlideElement[];
  single: SlideElement | null;
  actions: EditorActions;
  onPatchOne: (p: ElementPatch) => void;
  onPatchAll: (p: ElementPatch) => void;
}) {
  const units = selectionUnits(selected).length;
  const grouped = selected.some((e) => e.groupId);
  const allLocked = selected.every((e) => e.locked);
  const anims = new Set(selected.map((e) => e.anim ?? "up"));
  const anim = anims.size === 1 ? [...anims][0] : "";

  return (
    <Section title="Arrange">
      <label className="mb-1 block text-xs text-sigma-ink/50">
        Align {units > 1 ? "to each other" : "on the slide"}
      </label>
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

      {units >= 3 && (
        <>
          <label className="mb-1 block text-xs text-sigma-ink/50">
            Space evenly
          </label>
          <div className="mb-3 grid grid-cols-2 gap-1.5">
            <button
              onClick={() => actions.distribute("h")}
              className={`${btn} flex items-center justify-center gap-1.5`}
            >
              <AlignIcon edge="dh" /> Horizontally
            </button>
            <button
              onClick={() => actions.distribute("v")}
              className={`${btn} flex items-center justify-center gap-1.5`}
            >
              <AlignIcon edge="dv" /> Vertically
            </button>
          </div>
        </>
      )}

      <label className="mb-1 block text-xs text-sigma-ink/50">Layer</label>
      <div className="mb-3 grid grid-cols-2 gap-1.5">
        <button onClick={() => actions.layer("front")} className={btn} title="Ctrl+Shift+]">
          ⇈ To front
        </button>
        <button onClick={() => actions.layer("forward")} className={btn} title="Ctrl+]">
          ↑ Forward
        </button>
        <button onClick={() => actions.layer("backward")} className={btn} title="Ctrl+[">
          ↓ Backward
        </button>
        <button onClick={() => actions.layer("back")} className={btn} title="Ctrl+Shift+[">
          ⇊ To back
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {selected.length > 1 && units > 1 && (
          <button onClick={actions.group} className={btn} title="Ctrl+G">
            Group
          </button>
        )}
        {grouped && (
          <button onClick={actions.ungroup} className={btn} title="Ctrl+Shift+G">
            Ungroup
          </button>
        )}
        <button
          onClick={actions.toggleLock}
          className={allLocked ? btnActive : btn}
          title="Locked elements can't be moved by accident"
        >
          {allLocked ? "🔒 Locked" : "🔓 Lock"}
        </button>
        <button onClick={actions.duplicate} className={btn} title="Ctrl+D">
          Duplicate
        </button>
      </div>

      {single && (
        <>
          <label className="mb-1 block text-xs text-sigma-ink/50">
            Position &amp; size
          </label>
          <div className="mb-3 grid grid-cols-2 gap-1.5">
            <NumField label="X" value={single.x} onChange={(x) => onPatchOne({ x })} />
            <NumField label="Y" value={single.y} onChange={(y) => onPatchOne({ y })} />
            <NumField
              label="W"
              value={single.w}
              min={8}
              onChange={(w) => onPatchOne({ w })}
            />
            {single.type !== "text" ? (
              <NumField
                label="H"
                value={single.h}
                min={4}
                onChange={(h) => onPatchOne({ h })}
              />
            ) : (
              <span />
            )}
            <NumField
              label="↻°"
              value={single.rotation ?? 0}
              onChange={(r) => onPatchOne({ rotation: ((r % 360) + 360) % 360 })}
            />
          </div>
        </>
      )}

      <label className="mb-1 block text-xs text-sigma-ink/50">
        Entrance animation
      </label>
      <select
        value={anim}
        onChange={(e) =>
          onPatchAll({ anim: e.target.value as SlideElement["anim"] })
        }
        className="w-full rounded-lg border border-sigma-ink/15 bg-white px-2 py-1.5 text-sm"
      >
        {!anim && <option value="">Mixed</option>}
        {ANIMS.map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </select>
    </Section>
  );
}

// ---- per-type panels ------------------------------------------------------

const AI_PRESETS: { label: string; instruction: string }[] = [
  { label: "Improve", instruction: "Improve clarity and flow without changing the meaning." },
  { label: "Shorten", instruction: "Make it more concise and punchy." },
  { label: "Expand", instruction: "Expand into a fuller, well-written sentence or two." },
  { label: "Professional", instruction: "Rewrite in a polished, professional tone." },
  { label: "Friendlier", instruction: "Rewrite in a warmer, friendlier tone." },
];

function deleteLabel(count: number) {
  return count > 1 ? `Delete ${count} elements` : "Delete element";
}

function TextProps({
  el,
  count,
  busy,
  onChange,
  onFix,
  onRewrite,
  onDelete,
}: {
  el: TextElement;
  count: number;
  busy: string;
  onChange: (p: Partial<TextElement>) => void;
  onFix: () => void;
  onRewrite: (instruction: string) => void;
  onDelete: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const aiBusy = busy === "ai";
  return (
    <Section title={count > 1 ? `Text · ${count} selected` : "Text"}>
      {/* AI assist (single text box only) */}
      {count === 1 && (
        <div className="mb-3 rounded-xl border border-sigma-orange/30 bg-sigma-orange/5 p-2.5">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-sigma-orange">
            ✨ AI assist
          </div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            <button
              onClick={onFix}
              disabled={aiBusy}
              className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-sigma-ink shadow-sm transition hover:bg-sigma-sand disabled:opacity-60"
            >
              Fix grammar
            </button>
            {AI_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => onRewrite(p.instruction)}
                disabled={aiBusy}
                className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-sigma-ink shadow-sm transition hover:bg-sigma-sand disabled:opacity-60"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && prompt.trim()) {
                  onRewrite(prompt);
                  setPrompt("");
                }
              }}
              placeholder="Tell AI what to do…"
              className="min-w-0 flex-1 rounded-lg border border-sigma-ink/15 bg-white px-2 py-1.5 text-xs outline-none ring-sigma-orange/40 focus:ring-2"
            />
            <button
              onClick={() => {
                if (prompt.trim()) {
                  onRewrite(prompt);
                  setPrompt("");
                }
              }}
              disabled={aiBusy || !prompt.trim()}
              className="sigma-gradient rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-card transition hover:brightness-105 disabled:opacity-50"
            >
              {aiBusy ? "…" : "Go"}
            </button>
          </div>
        </div>
      )}

      <label className="mb-1 block text-xs text-sigma-ink/50">Font</label>
      <select
        value={el.fontFamily}
        onChange={(e) => onChange({ fontFamily: e.target.value })}
        className="mb-3 w-full rounded-lg border border-sigma-ink/15 bg-white px-2 py-1.5 text-sm"
      >
        {FONT_OPTIONS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      <div className="mb-3 flex gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-sigma-ink/50">Size</label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onChange({ fontSize: Math.max(6, el.fontSize - 2) })}
              className={`${btn} px-2`}
              title="Smaller"
            >
              −
            </button>
            <input
              type="number"
              value={el.fontSize}
              onChange={(e) => onChange({ fontSize: Number(e.target.value) || 1 })}
              className="w-full min-w-0 rounded-lg border border-sigma-ink/15 px-2 py-1.5 text-sm"
            />
            <button
              onClick={() => onChange({ fontSize: el.fontSize + 2 })}
              className={`${btn} px-2`}
              title="Bigger"
            >
              +
            </button>
          </div>
        </div>
        <div className="w-[76px]">
          <label className="mb-1 block text-xs text-sigma-ink/50">Weight</label>
          <select
            value={el.fontWeight}
            onChange={(e) => onChange({ fontWeight: Number(e.target.value) })}
            className="w-full rounded-lg border border-sigma-ink/15 bg-white px-2 py-1.5 text-sm"
          >
            {[400, 500, 600, 700, 800].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="mb-1 block text-xs text-sigma-ink/50">Style</label>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(["left", "center", "right"] as const).map((a) => (
          <button
            key={a}
            onClick={() => onChange({ align: a })}
            className={el.align === a ? btnActive : btn}
            title={`Align text ${a}`}
          >
            {a === "left" ? "⯇" : a === "center" ? "≡" : "⯈"}
          </button>
        ))}
        <button
          onClick={() => onChange({ fontWeight: el.fontWeight >= 700 ? 400 : 700 })}
          className={el.fontWeight >= 700 ? btnActive : btn}
          title="Bold"
        >
          <b>B</b>
        </button>
        <button
          onClick={() => onChange({ italic: !el.italic })}
          className={el.italic ? btnActive : btn}
          title="Italic"
        >
          <i>I</i>
        </button>
        <button
          onClick={() => onChange({ uppercase: !el.uppercase })}
          className={el.uppercase ? btnActive : btn}
          title="Uppercase"
        >
          AA
        </button>
      </div>

      <label className="mb-1 block text-xs text-sigma-ink/50">
        Line spacing: {(el.lineHeight ?? 1.3).toFixed(2)}
      </label>
      <input
        type="range"
        min={80}
        max={220}
        value={Math.round((el.lineHeight ?? 1.3) * 100)}
        onChange={(e) => onChange({ lineHeight: Number(e.target.value) / 100 })}
        className="mb-2 w-full accent-sigma-orange"
      />
      <label className="mb-1 block text-xs text-sigma-ink/50">
        Letter spacing: {el.letterSpacing ?? 0}
      </label>
      <input
        type="range"
        min={-3}
        max={20}
        step={0.5}
        value={el.letterSpacing ?? 0}
        onChange={(e) =>
          onChange({ letterSpacing: Number(e.target.value) || undefined })
        }
        className="mb-3 w-full accent-sigma-orange"
      />

      <label className="mb-1 block text-xs text-sigma-ink/50">Colour</label>
      <div className="mb-3">
        <ColorRow value={el.color} onChange={(c) => onChange({ color: c })} />
      </div>

      <button onClick={onDelete} className={deleteBtn}>
        {deleteLabel(count)}
      </button>
    </Section>
  );
}

function ImageProps({
  el,
  count,
  busy,
  onChange,
  onReplace,
  onDelete,
}: {
  el: ImageElement;
  count: number;
  busy: string;
  onChange: (p: Partial<ImageElement>) => void;
  onReplace: () => void;
  onDelete: () => void;
}) {
  return (
    <Section title={count > 1 ? `Image · ${count} selected` : "Image"}>
      {count === 1 && (
        <button onClick={onReplace} className={`${btn} mb-3 w-full`}>
          {busy === "upload" ? "Uploading…" : "Replace image"}
        </button>
      )}

      <div className="mb-3 flex gap-2">
        <button
          onClick={() => onChange({ fit: el.fit === "cover" ? "contain" : "cover" })}
          className={btn}
        >
          Fit: {el.fit ?? "cover"}
        </button>
        <button
          onClick={() => onChange({ circle: !el.circle })}
          className={el.circle ? btnActive : btn}
        >
          Circle
        </button>
        <button
          onClick={() => onChange({ shadow: !el.shadow })}
          className={el.shadow ? btnActive : btn}
        >
          Shadow
        </button>
      </div>

      <label className="mb-1 block text-xs text-sigma-ink/50">
        Corner radius: {el.circle ? "—" : (el.radius ?? 0)}
      </label>
      <input
        type="range"
        min={0}
        max={80}
        value={el.radius ?? 0}
        disabled={el.circle}
        onChange={(e) => onChange({ radius: Number(e.target.value) })}
        className="mb-3 w-full accent-sigma-orange"
      />

      <button onClick={onDelete} className={deleteBtn}>
        {deleteLabel(count)}
      </button>
    </Section>
  );
}

function VideoProps({
  el,
  count,
  onChange,
  onDelete,
}: {
  el: VideoElement;
  count: number;
  onChange: (p: Partial<VideoElement>) => void;
  onDelete: () => void;
}) {
  return (
    <Section title={count > 1 ? `Video · ${count} selected` : "Video"}>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          onClick={() => onChange({ autoplay: !(el.autoplay ?? true) })}
          className={(el.autoplay ?? true) ? btnActive : btn}
        >
          Autoplay
        </button>
        <button
          onClick={() => onChange({ loop: !(el.loop ?? true) })}
          className={(el.loop ?? true) ? btnActive : btn}
        >
          Loop
        </button>
        <button
          onClick={() => onChange({ muted: !(el.muted ?? true) })}
          className={(el.muted ?? true) ? btnActive : btn}
        >
          Muted
        </button>
        <button
          onClick={() => onChange({ controls: !el.controls })}
          className={el.controls ? btnActive : btn}
        >
          Controls
        </button>
        <button
          onClick={() => onChange({ shadow: !el.shadow })}
          className={el.shadow ? btnActive : btn}
        >
          Shadow
        </button>
      </div>

      <label className="mb-1 block text-xs text-sigma-ink/50">
        Corner radius: {el.radius ?? 0}
      </label>
      <input
        type="range"
        min={0}
        max={80}
        value={el.radius ?? 0}
        onChange={(e) => onChange({ radius: Number(e.target.value) })}
        className="mb-3 w-full accent-sigma-orange"
      />

      <button onClick={onDelete} className={deleteBtn}>
        {deleteLabel(count)}
      </button>
    </Section>
  );
}

function ShapeProps({
  el,
  count,
  onChange,
  onDelete,
}: {
  el: ShapeElement;
  count: number;
  onChange: (p: Partial<ShapeElement>) => void;
  onDelete: () => void;
}) {
  return (
    <Section title={count > 1 ? `Shape · ${count} selected` : "Shape"}>
      <label className="mb-1 block text-xs text-sigma-ink/50">Type</label>
      <div className="mb-3 flex gap-2">
        {(["rect", "triangle", "line", "blob"] as const).map((k) => (
          <button
            key={k}
            onClick={() => onChange({ kind: k })}
            className={el.kind === k ? btnActive : btn}
          >
            {k}
          </button>
        ))}
      </div>

      <label className="mb-1 block text-xs text-sigma-ink/50">Fill</label>
      <div className="mb-3">
        <ColorRow value={el.fill} onChange={(c) => onChange({ fill: c })} />
      </div>

      {el.kind !== "triangle" && el.kind !== "blob" && (
        <>
          <label className="mb-1 block text-xs text-sigma-ink/50">
            Corner radius: {el.radius ?? 0}
          </label>
          <input
            type="range"
            min={0}
            max={120}
            value={el.radius ?? 0}
            onChange={(e) => onChange({ radius: Number(e.target.value) })}
            className="mb-3 w-full accent-sigma-orange"
          />
        </>
      )}

      <label className="mb-1 block text-xs text-sigma-ink/50">
        Opacity: {Math.round((el.opacity ?? 1) * 100)}%
      </label>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round((el.opacity ?? 1) * 100)}
        onChange={(e) => onChange({ opacity: Number(e.target.value) / 100 })}
        className="mb-3 w-full accent-sigma-orange"
      />

      <button onClick={onDelete} className={deleteBtn}>
        {deleteLabel(count)}
      </button>
    </Section>
  );
}
