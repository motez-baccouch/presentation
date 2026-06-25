"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  PresentationData,
  SlideData,
  SlideDocument,
  SlideElement,
  SlideBackground,
} from "@/lib/types";
import { buildBlankSlide } from "@/lib/templates";
import { SlideRail } from "./SlideRail";
import { EditorCanvas } from "./EditorCanvas";
import { Inspector } from "./Inspector";
import { usePresence } from "./usePresence";
import { NamePrompt, PresencePills } from "./Presence";

type SaveState = "idle" | "saving" | "saved";

export function Editor({
  initial,
  startSlideKey,
}: {
  initial: PresentationData;
  startSlideKey?: string;
}) {
  const [slides, setSlides] = useState<SlideData[]>(initial.slides);
  const [index, setIndex] = useState(() => {
    if (!startSlideKey) return 0;
    const i = initial.slides.findIndex(
      (s) => s.personKey === startSlideKey || s.id === startSlideKey,
    );
    return i >= 0 ? i : 0;
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const slidesRef = useRef(slides);
  slidesRef.current = slides;
  const dirty = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = slides[Math.min(index, slides.length - 1)];
  const selected = useMemo(
    () => current?.document.elements.find((e) => e.id === selectedId) ?? null,
    [current, selectedId],
  );

  const presence = usePresence(current?.id ?? null);
  const presenceBySlide = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const o of presence.others) {
      if (!o.slideId) continue;
      (map[o.slideId] ??= []).push(o.name);
    }
    return map;
  }, [presence.others]);
  const othersHere = current
    ? presence.others.filter((o) => o.slideId === current.id).map((o) => o.name)
    : [];

  const flush = useCallback(async () => {
    const ids = [...dirty.current];
    dirty.current.clear();
    if (!ids.length) return;
    setSaveState("saving");
    await Promise.all(
      ids.map((id) => {
        const slide = slidesRef.current.find((s) => s.id === id);
        if (!slide) return Promise.resolve();
        return fetch(`/api/slides/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document: slide.document }),
        });
      }),
    );
    setSaveState("saved");
  }, []);

  const markDirty = useCallback(
    (id: string) => {
      dirty.current.add(id);
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 650);
    },
    [flush],
  );

  // flush pending edits when leaving the page
  useEffect(() => {
    const handler = () => {
      if (dirty.current.size && navigator.sendBeacon) {
        for (const id of dirty.current) {
          const slide = slidesRef.current.find((s) => s.id === id);
          if (slide)
            navigator.sendBeacon(
              `/api/slides/${id}`,
              new Blob([JSON.stringify({ document: slide.document })], {
                type: "application/json",
              }),
            );
        }
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // ---- document mutations -------------------------------------------------
  const mutateDoc = useCallback(
    (slideId: string, updater: (doc: SlideDocument) => SlideDocument) => {
      setSlides((prev) =>
        prev.map((s) =>
          s.id === slideId ? { ...s, document: updater(s.document) } : s,
        ),
      );
      markDirty(slideId);
    },
    [markDirty],
  );

  const updateElement = useCallback(
    (elId: string, patch: Partial<SlideElement>) => {
      if (!current) return;
      mutateDoc(current.id, (doc) => ({
        ...doc,
        elements: doc.elements.map((e) =>
          e.id === elId ? ({ ...e, ...patch } as SlideElement) : e,
        ),
      }));
    },
    [current, mutateDoc],
  );

  const addElement = useCallback(
    (el: SlideElement) => {
      if (!current) return;
      mutateDoc(current.id, (doc) => ({
        ...doc,
        elements: [...doc.elements, el],
      }));
      setSelectedId(el.id);
    },
    [current, mutateDoc],
  );

  const deleteElement = useCallback(
    (elId: string) => {
      if (!current) return;
      mutateDoc(current.id, (doc) => ({
        ...doc,
        elements: doc.elements.filter((e) => e.id !== elId),
      }));
      setSelectedId(null);
    },
    [current, mutateDoc],
  );

  const setBackground = useCallback(
    (bg: SlideBackground) => {
      if (!current) return;
      mutateDoc(current.id, (doc) => ({ ...doc, background: bg }));
    },
    [current, mutateDoc],
  );

  // ---- structural (slide-level) ops --------------------------------------
  const addSlide = useCallback(async () => {
    const afterId = current?.id ?? null;
    const res = await fetch("/api/slides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        afterId,
        type: "CUSTOM",
        document: buildBlankSlide(),
      }),
    });
    const slide: SlideData = await res.json();
    setSlides((prev) => {
      const at = prev.findIndex((s) => s.id === afterId);
      const next = [...prev];
      next.splice(at + 1, 0, slide);
      return next;
    });
    setIndex((i) => i + 1);
    setSelectedId(null);
  }, [current]);

  const duplicateSlide = useCallback(async (id: string) => {
    const res = await fetch(`/api/slides/${id}/duplicate`, { method: "POST" });
    if (!res.ok) return;
    const slide: SlideData = await res.json();
    setSlides((prev) => {
      const at = prev.findIndex((s) => s.id === id);
      const next = [...prev];
      next.splice(at + 1, 0, slide);
      return next;
    });
  }, []);

  const removeSlide = useCallback(
    async (id: string) => {
      if (slides.length <= 1) return;
      await fetch(`/api/slides/${id}`, { method: "DELETE" });
      setSlides((prev) => prev.filter((s) => s.id !== id));
      setIndex((i) => Math.max(0, Math.min(i, slides.length - 2)));
      setSelectedId(null);
    },
    [slides.length],
  );

  const [summarizing, setSummarizing] = useState(false);
  const regenerateSummary = useCallback(async () => {
    setSummarizing(true);
    try {
      await fetch("/api/summary/regenerate", { method: "POST" });
      const deck: PresentationData = await (
        await fetch("/api/presentation")
      ).json();
      setSlides(deck.slides);
      const summaryIdx = deck.slides.findIndex((s) => s.type === "SUMMARY");
      if (summaryIdx >= 0) setIndex(summaryIdx);
      setSelectedId(null);
    } finally {
      setSummarizing(false);
    }
  }, []);

  const [posting, setPosting] = useState(false);
  const postToSlack = useCallback(async () => {
    setPosting(true);
    try {
      const res = await fetch("/api/slack/post-summary", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        alert("✅ Posted the summary to #weekly-updates!");
      } else {
        alert(`⚠️ ${data.error ?? "Could not post to Slack."}`);
      }
    } finally {
      setPosting(false);
    }
  }, []);

  const reorder = useCallback((orderedIds: string[]) => {
    setSlides((prev) => {
      const map = new Map(prev.map((s) => [s.id, s]));
      return orderedIds
        .map((id) => map.get(id))
        .filter(Boolean) as SlideData[];
    });
    fetch("/api/slides/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds }),
    });
  }, []);

  if (!current) return null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-sigma-sand">
      {/* top bar */}
      <div className="flex items-center justify-between border-b border-sigma-ink/10 bg-white px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Image
              src="/brand/logo.svg"
              alt="Sigma"
              width={96}
              height={44}
              className="h-7 w-auto"
            />
          </Link>
          <span className="hidden text-sm font-semibold text-sigma-ink/70 sm:block">
            {initial.title}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <PresencePills others={presence.others} />
          <span className="hidden text-sigma-ink/50 sm:inline">
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "All changes saved"
                : ""}
          </span>
          <button
            onClick={regenerateSummary}
            disabled={summarizing}
            className="rounded-full border border-sigma-ink/15 px-4 py-1.5 font-semibold text-sigma-ink transition hover:bg-sigma-sand disabled:opacity-60"
          >
            {summarizing ? "Summarizing…" : "✨ AI summary"}
          </button>
          <button
            onClick={postToSlack}
            disabled={posting}
            className="sigma-gradient rounded-full px-4 py-1.5 font-semibold text-white shadow-card transition hover:brightness-105 disabled:opacity-60"
          >
            {posting ? "Posting…" : "📣 Post to Slack"}
          </button>
          <Link
            href="/present"
            className="rounded-full border border-sigma-ink/15 px-4 py-1.5 font-semibold text-sigma-ink transition hover:bg-sigma-sand"
          >
            ▶ Present
          </Link>
        </div>
      </div>

      {/* body */}
      <div className="flex min-h-0 flex-1">
        <SlideRail
          slides={slides}
          index={index}
          presenceBySlide={presenceBySlide}
          onSelect={(i) => {
            setIndex(i);
            setSelectedId(null);
          }}
          onAdd={addSlide}
          onDuplicate={duplicateSlide}
          onDelete={removeSlide}
          onReorder={reorder}
        />

        <EditorCanvas
          slide={current}
          selectedId={selectedId}
          othersHere={othersHere}
          onSelect={setSelectedId}
          onUpdateElement={updateElement}
        />

        <Inspector
          slide={current}
          selected={selected}
          onUpdateElement={updateElement}
          onDeleteElement={deleteElement}
          onAddElement={addElement}
          onSetBackground={setBackground}
        />
      </div>

      {presence.initialized && !presence.name && (
        <NamePrompt onSave={presence.setName} />
      )}
    </div>
  );
}
