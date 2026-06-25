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

export function Inspector({
  slide,
  selected,
  onUpdateElement,
  onDeleteElement,
  onAddElement,
  onSetBackground,
}: {
  slide: SlideData;
  selected: SlideElement | null;
  onUpdateElement: (id: string, patch: Partial<SlideElement>) => void;
  onDeleteElement: (id: string) => void;
  onAddElement: (el: SlideElement) => void;
  onSetBackground: (bg: SlideBackground) => void;
}) {
  const fileAdd = useRef<HTMLInputElement>(null);
  const fileReplace = useRef<HTMLInputElement>(null);
  const fileVideo = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string>("");

  async function upload(file: File): Promise<string | null> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error ?? "Upload failed.");
      return null;
    }
    return data.url as string;
  }

  async function addImage(file: File) {
    setBusy("upload");
    const url = await upload(file);
    setBusy("");
    if (!url) return;
    onAddElement({
      id: genId(),
      type: "image",
      url,
      x: 440,
      y: 200,
      w: 400,
      h: 300,
      fit: "cover",
      radius: 16,
      shadow: true,
      anim: "pop",
      z: 8,
    });
  }

  async function addVideo(file: File) {
    setBusy("video");
    const url = await upload(file);
    setBusy("");
    if (!url) return;
    onAddElement({
      id: genId(),
      type: "video",
      url,
      x: 420,
      y: 190,
      w: 440,
      h: 248,
      radius: 16,
      shadow: true,
      autoplay: true,
      loop: true,
      muted: true,
      controls: false,
      anim: "pop",
      z: 8,
    });
  }

  async function replaceImage(file: File) {
    if (!selected || selected.type !== "image") return;
    setBusy("upload");
    const url = await upload(file);
    setBusy("");
    if (url) onUpdateElement(selected.id, { url });
  }

  async function fixGrammar() {
    if (!selected || selected.type !== "text") return;
    setBusy("ai");
    const res = await fetch("/api/ai/grammar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: selected.text }),
    });
    setBusy("");
    if (res.ok) {
      const { text } = await res.json();
      onUpdateElement(selected.id, { text });
    }
  }

  async function rewrite(instruction: string) {
    if (!selected || selected.type !== "text" || !instruction.trim()) return;
    setBusy("ai");
    const res = await fetch("/api/ai/rewrite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: selected.text, instruction }),
    });
    setBusy("");
    if (res.ok) {
      const { text } = await res.json();
      onUpdateElement(selected.id, { text });
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

  return (
    <aside className="thin-scroll w-72 shrink-0 overflow-y-auto border-l border-sigma-ink/10 bg-white">
      {/* add */}
      <Section title="Add to slide">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={addText} className={btn}>
            + Text
          </button>
          <button onClick={() => fileAdd.current?.click()} className={btn}>
            {busy === "upload" ? "…" : "+ Image"}
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
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) addImage(f);
            e.target.value = "";
          }}
        />
        <input
          ref={fileVideo}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) addVideo(f);
            e.target.value = "";
          }}
        />
      </Section>

      {/* element properties */}
      {!selected && (
        <Section title="Tip">
          <p className="text-xs leading-relaxed text-sigma-ink/55">
            Click an element to edit it. Double-click text to type. Drag to move,
            drag the handles to resize.
          </p>
        </Section>
      )}

      {selected?.type === "text" && (
        <TextProps
          el={selected}
          busy={busy}
          onChange={(p) => onUpdateElement(selected.id, p)}
          onFix={fixGrammar}
          onRewrite={rewrite}
          onDelete={() => onDeleteElement(selected.id)}
        />
      )}

      {selected?.type === "image" && (
        <ImageProps
          el={selected}
          busy={busy}
          onChange={(p) => onUpdateElement(selected.id, p)}
          onReplace={() => fileReplace.current?.click()}
          onDelete={() => onDeleteElement(selected.id)}
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

      {selected?.type === "video" && (
        <VideoProps
          el={selected}
          onChange={(p) => onUpdateElement(selected.id, p)}
          onDelete={() => onDeleteElement(selected.id)}
        />
      )}

      {selected?.type === "shape" && (
        <ShapeProps
          el={selected}
          onChange={(p) => onUpdateElement(selected.id, p)}
          onDelete={() => onDeleteElement(selected.id)}
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

const AI_PRESETS: { label: string; instruction: string }[] = [
  { label: "Improve", instruction: "Improve clarity and flow without changing the meaning." },
  { label: "Shorten", instruction: "Make it more concise and punchy." },
  { label: "Expand", instruction: "Expand into a fuller, well-written sentence or two." },
  { label: "Professional", instruction: "Rewrite in a polished, professional tone." },
  { label: "Friendlier", instruction: "Rewrite in a warmer, friendlier tone." },
];

function TextProps({
  el,
  busy,
  onChange,
  onFix,
  onRewrite,
  onDelete,
}: {
  el: TextElement;
  busy: string;
  onChange: (p: Partial<TextElement>) => void;
  onFix: () => void;
  onRewrite: (instruction: string) => void;
  onDelete: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const aiBusy = busy === "ai";
  return (
    <Section title="Text">
      {/* AI assist */}
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
          <input
            type="number"
            value={el.fontSize}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) || 1 })}
            className="w-full rounded-lg border border-sigma-ink/15 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex-1">
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

      <label className="mb-1 block text-xs text-sigma-ink/50">Align</label>
      <div className="mb-3 flex gap-2">
        {(["left", "center", "right"] as const).map((a) => (
          <button
            key={a}
            onClick={() => onChange({ align: a })}
            className={el.align === a ? btnActive : btn}
          >
            {a === "left" ? "⯇" : a === "center" ? "≡" : "⯈"}
          </button>
        ))}
        <button
          onClick={() => onChange({ uppercase: !el.uppercase })}
          className={el.uppercase ? btnActive : btn}
          title="Uppercase"
        >
          AA
        </button>
      </div>

      <label className="mb-1 block text-xs text-sigma-ink/50">Colour</label>
      <div className="mb-3">
        <ColorRow value={el.color} onChange={(c) => onChange({ color: c })} />
      </div>

      <button
        onClick={onDelete}
        className="w-full rounded-lg border border-sigma-red/30 py-1.5 text-xs font-semibold text-sigma-red transition hover:bg-sigma-red/5"
      >
        Delete element
      </button>
    </Section>
  );
}

function ImageProps({
  el,
  busy,
  onChange,
  onReplace,
  onDelete,
}: {
  el: ImageElement;
  busy: string;
  onChange: (p: Partial<ImageElement>) => void;
  onReplace: () => void;
  onDelete: () => void;
}) {
  return (
    <Section title="Image">
      <button onClick={onReplace} className={`${btn} mb-3 w-full`}>
        {busy === "upload" ? "Uploading…" : "Replace image"}
      </button>

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

      <button
        onClick={onDelete}
        className="w-full rounded-lg border border-sigma-red/30 py-1.5 text-xs font-semibold text-sigma-red transition hover:bg-sigma-red/5"
      >
        Delete element
      </button>
    </Section>
  );
}

function VideoProps({
  el,
  onChange,
  onDelete,
}: {
  el: VideoElement;
  onChange: (p: Partial<VideoElement>) => void;
  onDelete: () => void;
}) {
  return (
    <Section title="Video">
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

      <button
        onClick={onDelete}
        className="w-full rounded-lg border border-sigma-red/30 py-1.5 text-xs font-semibold text-sigma-red transition hover:bg-sigma-red/5"
      >
        Delete element
      </button>
    </Section>
  );
}

function ShapeProps({
  el,
  onChange,
  onDelete,
}: {
  el: ShapeElement;
  onChange: (p: Partial<ShapeElement>) => void;
  onDelete: () => void;
}) {
  return (
    <Section title="Shape">
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

      <button
        onClick={onDelete}
        className="w-full rounded-lg border border-sigma-red/30 py-1.5 text-xs font-semibold text-sigma-red transition hover:bg-sigma-red/5"
      >
        Delete element
      </button>
    </Section>
  );
}
