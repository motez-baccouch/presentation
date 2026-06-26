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
import { buildBlankSlide, genId } from "@/lib/templates";
import { SlideRail } from "./SlideRail";
import { EditorCanvas } from "./EditorCanvas";
import { Inspector } from "./Inspector";
import { usePresence } from "./usePresence";
import { NamePrompt, PresencePills } from "./Presence";
import { useDeckVersion } from "../useDeckVersion";

type SaveState = "idle" | "saving" | "saved";

/** Deep-clone an element with a fresh id, nudged by (dx, dy) like Canva paste. */
function cloneElement(el: SlideElement, dx: number, dy: number): SlideElement {
  return {
    ...(JSON.parse(JSON.stringify(el)) as SlideElement),
    id: genId(),
    x: Math.round(el.x + dx),
    y: Math.round(el.y + dy),
  };
}

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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const slidesRef = useRef(slides);
  slidesRef.current = slides;
  const dirty = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshKnownRef = useRef<() => Promise<void>>(async () => {});
  const [deckChanged, setDeckChanged] = useState(false);

  // ---- undo / redo history -----------------------------------------------
  // Snapshots are whole `slides` arrays. All mutations are immutable (new
  // arrays + new document objects), so a stored reference is a frozen snapshot.
  // History only tracks document edits; structural ops (add/remove/reorder
  // slides) reset it so undo can never resurrect a server-deleted slide.
  const past = useRef<SlideData[][]>([]);
  const future = useRef<SlideData[][]>([]);
  const lastEditAt = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const HISTORY_LIMIT = 100;
  const COALESCE_MS = 500;

  // Canva-style element clipboard (in-memory; persists across slides).
  const clipboard = useRef<SlideElement[] | null>(null);
  const pasteCount = useRef(0);

  const syncHist = useCallback(() => {
    setCanUndo(past.current.length > 0);
    setCanRedo(future.current.length > 0);
  }, []);

  const resetHistory = useCallback(() => {
    past.current = [];
    future.current = [];
    lastEditAt.current = 0;
    syncHist();
  }, [syncHist]);

  // Capture the pre-edit state, coalescing bursts (e.g. a drag) into one step.
  const pushHistory = useCallback(() => {
    const now = Date.now();
    if (now - lastEditAt.current > COALESCE_MS) {
      past.current.push(slidesRef.current);
      if (past.current.length > HISTORY_LIMIT) past.current.shift();
      future.current = [];
      syncHist();
    }
    lastEditAt.current = now;
  }, [syncHist]);

  const current = slides[Math.min(index, slides.length - 1)];
  // the "primary" element (last one added to the selection) drives the Inspector
  const selected = useMemo(() => {
    const id = selectedIds[selectedIds.length - 1];
    return current?.document.elements.find((e) => e.id === id) ?? null;
  }, [current, selectedIds]);

  // click selection: plain click selects one (keeps a group if already in it);
  // Ctrl/Cmd/Shift+click toggles an element in/out of a multi-selection.
  const select = useCallback((id: string | null, additive = false) => {
    setSelectedIds((prev) => {
      if (!id) return [];
      if (additive)
        return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      return prev.includes(id) ? prev : [id];
    });
  }, []);

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

  const reloadDeck = useCallback(async () => {
    const deck: PresentationData = await (
      await fetch("/api/presentation", { cache: "no-store" })
    ).json();
    setSlides(deck.slides);
    setIndex((i) => Math.min(i, deck.slides.length - 1));
    setSelectedIds([]);
    setDeckChanged(false);
    resetHistory();
    await refreshKnownRef.current();
  }, [resetHistory]);

  const { refreshKnown } = useDeckVersion(() => setDeckChanged(true));
  refreshKnownRef.current = refreshKnown;

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
    // our own saves shouldn't trigger the "deck updated" banner
    await refreshKnownRef.current();
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
      pushHistory();
      setSlides((prev) =>
        prev.map((s) =>
          s.id === slideId ? { ...s, document: updater(s.document) } : s,
        ),
      );
      markDirty(slideId);
    },
    [markDirty, pushHistory],
  );

  // Restore a history snapshot and persist whichever slides' documents changed.
  const applyHistory = useCallback((target: SlideData[]) => {
    const currById = new Map(slidesRef.current.map((s) => [s.id, s]));
    for (const s of target) {
      const before = currById.get(s.id);
      if (!before || before.document !== s.document) dirty.current.add(s.id);
    }
    setSlides(target);
    slidesRef.current = target;
    setSelectedIds([]);
    lastEditAt.current = 0;
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 300);
  }, [flush]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(slidesRef.current);
    applyHistory(prev);
    syncHist();
  }, [applyHistory, syncHist]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(slidesRef.current);
    applyHistory(next);
    syncHist();
  }, [applyHistory, syncHist]);

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
      setSelectedIds([el.id]);
    },
    [current, mutateDoc],
  );

  // add several elements at once (group paste / duplicate) and select them all
  const addElements = useCallback(
    (els: SlideElement[]) => {
      if (!current || !els.length) return;
      mutateDoc(current.id, (doc) => ({
        ...doc,
        elements: [...doc.elements, ...els],
      }));
      setSelectedIds(els.map((e) => e.id));
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
      setSelectedIds([]);
    },
    [current, mutateDoc],
  );

  // delete every selected element (Delete/Backspace, or cut)
  const deleteSelected = useCallback(() => {
    if (!current || !selectedIds.length) return;
    const ids = new Set(selectedIds);
    mutateDoc(current.id, (doc) => ({
      ...doc,
      elements: doc.elements.filter((e) => !ids.has(e.id)),
    }));
    setSelectedIds([]);
  }, [current, mutateDoc, selectedIds]);

  // move all selected elements by the same delta (group drag)
  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (!current || !selectedIds.length) return;
      const ids = new Set(selectedIds);
      mutateDoc(current.id, (doc) => ({
        ...doc,
        elements: doc.elements.map((e) =>
          ids.has(e.id)
            ? { ...e, x: Math.round(e.x + dx), y: Math.round(e.y + dy) }
            : e,
        ),
      }));
    },
    [current, mutateDoc, selectedIds],
  );

  const setBackground = useCallback(
    (bg: SlideBackground) => {
      if (!current) return;
      mutateDoc(current.id, (doc) => ({ ...doc, background: bg }));
    },
    [current, mutateDoc],
  );

  // keyboard: undo/redo, Delete, + Canva-style copy / cut / paste / duplicate
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // let inputs / textareas / inline text editing keep their native shortcuts
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;

      // Delete / Backspace (no modifier) removes the selected element(s)
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        if (selectedIds.length) {
          e.preventDefault();
          deleteSelected();
        }
        return;
      }

      if (!(e.ctrlKey || e.metaKey)) return;
      const selectedEls = (current?.document.elements ?? []).filter((el) =>
        selectedIds.includes(el.id),
      );
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      } else if (k === "c") {
        if (selectedEls.length) {
          clipboard.current = JSON.parse(JSON.stringify(selectedEls));
          pasteCount.current = 0;
          e.preventDefault();
        }
      } else if (k === "x") {
        if (selectedEls.length) {
          clipboard.current = JSON.parse(JSON.stringify(selectedEls));
          pasteCount.current = 0;
          deleteSelected();
          e.preventDefault();
        }
      } else if (k === "v") {
        if (clipboard.current?.length) {
          e.preventDefault();
          const n = ++pasteCount.current;
          addElements(
            clipboard.current.map((el) => cloneElement(el, 24 * n, 24 * n)),
          );
        }
      } else if (k === "d") {
        if (selectedEls.length) {
          e.preventDefault();
          addElements(selectedEls.map((el) => cloneElement(el, 24, 24)));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, current, selectedIds, addElements, deleteSelected]);

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
    setSelectedIds([]);
    resetHistory();
  }, [current, resetHistory]);

  const duplicateSlide = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/slides/${id}/duplicate`, { method: "POST" });
      if (!res.ok) return;
      const slide: SlideData = await res.json();
      setSlides((prev) => {
        const at = prev.findIndex((s) => s.id === id);
        const next = [...prev];
        next.splice(at + 1, 0, slide);
        return next;
      });
      resetHistory();
    },
    [resetHistory],
  );

  const removeSlide = useCallback(
    async (id: string) => {
      if (slides.length <= 1) return;
      await fetch(`/api/slides/${id}`, { method: "DELETE" });
      setSlides((prev) => prev.filter((s) => s.id !== id));
      setIndex((i) => Math.max(0, Math.min(i, slides.length - 2)));
      setSelectedIds([]);
      resetHistory();
    },
    [slides.length, resetHistory],
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
      setSelectedIds([]);
      resetHistory();
    } finally {
      setSummarizing(false);
    }
  }, [resetHistory]);

  // tidy (re-paginate) or rewrite (re-run AI) the current member's slides
  const [organizing, setOrganizing] = useState<null | "tidy" | "rewrite">(null);
  const organizeMember = useCallback(
    async (action: "tidy" | "rewrite") => {
      const key = current?.type === "PERSON" ? current.personKey : null;
      if (!key) return;
      setOrganizing(action);
      try {
        await flush(); // persist any pending edits first
        const res = await fetch(`/api/person/${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(`⚠️ ${data.error ?? "Couldn't update the slide."}`);
          return;
        }
        const deck: PresentationData = await (
          await fetch("/api/presentation", { cache: "no-store" })
        ).json();
        setSlides(deck.slides);
        const idx = deck.slides.findIndex((s) => s.personKey === key);
        if (idx >= 0) setIndex(idx);
        setSelectedIds([]);
        resetHistory();
      } finally {
        setOrganizing(null);
      }
    },
    [current, flush, resetHistory],
  );

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

  const [downloading, setDownloading] = useState(false);
  const downloadSummary = useCallback(async () => {
    setDownloading(true);
    try {
      // make sure pending edits are saved so the image matches the deck
      await flush();
      const res = await fetch(`/api/og/summary?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("render failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sigma-weekly-summary.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("⚠️ Couldn't generate the summary image. Try again.");
    } finally {
      setDownloading(false);
    }
  }, [flush]);

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
    resetHistory();
  }, [resetHistory]);

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
          <div className="flex items-center">
            <button
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
              className="rounded-full px-2.5 py-1.5 text-base text-sigma-ink transition hover:bg-sigma-sand disabled:opacity-30"
            >
              ↶
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
              className="rounded-full px-2.5 py-1.5 text-base text-sigma-ink transition hover:bg-sigma-sand disabled:opacity-30"
            >
              ↷
            </button>
          </div>
          {current.type === "PERSON" && current.personKey && (
            <>
              <button
                onClick={() => organizeMember("tidy")}
                disabled={!!organizing}
                title="Re-pack this member's pages (fewer pages, less white space)"
                className="rounded-full border border-sigma-ink/15 px-4 py-1.5 font-semibold text-sigma-ink transition hover:bg-sigma-sand disabled:opacity-60"
              >
                {organizing === "tidy" ? "Tidying…" : "🧹 Tidy pages"}
              </button>
              <button
                onClick={() => organizeMember("rewrite")}
                disabled={!!organizing}
                title="Re-run the AI to rewrite this member's slide"
                className="rounded-full border border-sigma-ink/15 px-4 py-1.5 font-semibold text-sigma-ink transition hover:bg-sigma-sand disabled:opacity-60"
              >
                {organizing === "rewrite" ? "Rewriting…" : "✨ Rewrite member"}
              </button>
            </>
          )}
          <button
            onClick={regenerateSummary}
            disabled={summarizing}
            className="rounded-full border border-sigma-ink/15 px-4 py-1.5 font-semibold text-sigma-ink transition hover:bg-sigma-sand disabled:opacity-60"
          >
            {summarizing ? "Summarizing…" : "✨ AI summary"}
          </button>
          <button
            onClick={downloadSummary}
            disabled={downloading}
            title="Download this week's summary as an image"
            className="rounded-full border border-sigma-ink/15 px-4 py-1.5 font-semibold text-sigma-ink transition hover:bg-sigma-sand disabled:opacity-60"
          >
            {downloading ? "Preparing…" : "⬇ Download summary"}
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

      {deckChanged && (
        <div className="flex items-center justify-center gap-3 bg-sigma-yellow px-4 py-2 text-sm font-semibold text-sigma-ink">
          <span>🔄 The deck changed elsewhere (a teammate or Slack update).</span>
          <button
            onClick={reloadDeck}
            className="rounded-full bg-sigma-ink px-3 py-1 text-xs font-bold text-white transition hover:brightness-125"
          >
            Load latest
          </button>
          <button
            onClick={() => setDeckChanged(false)}
            className="text-xs font-semibold text-sigma-ink/60 hover:text-sigma-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* body */}
      <div className="flex min-h-0 flex-1">
        <SlideRail
          slides={slides}
          index={index}
          presenceBySlide={presenceBySlide}
          onSelect={(i) => {
            setIndex(i);
            setSelectedIds([]);
          }}
          onAdd={addSlide}
          onDuplicate={duplicateSlide}
          onDelete={removeSlide}
          onReorder={reorder}
        />

        <EditorCanvas
          slide={current}
          selectedIds={selectedIds}
          othersHere={othersHere}
          onSelect={select}
          onUpdateElement={updateElement}
          onNudgeSelected={nudgeSelected}
          onDeleteElement={deleteElement}
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
