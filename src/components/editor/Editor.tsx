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
  STAGE_WIDTH,
  STAGE_HEIGHT,
} from "@/lib/types";
import { buildBlankSlide, genId } from "@/lib/templates";
import { SlideRail } from "./SlideRail";
import { EditorCanvas } from "./EditorCanvas";
import { Inspector } from "./Inspector";
import { usePresence } from "./usePresence";
import { NamePrompt, PresencePills } from "./Presence";
import { useDeckVersion } from "../useDeckVersion";
import {
  Heights,
  LayerMove,
  boxOf,
  paintOrder,
  restack,
  selectionUnits,
  unionBox,
} from "./geometry";
import type { AlignEdge, EditorActions, ElementPatch, Patches } from "./actions";
import { imageElementFor, uploadFile, videoElementFor } from "./media";

type SaveState = "idle" | "saving" | "saved";

// Written to the system clipboard on copy, so a later Ctrl+V knows to paste
// our elements rather than whatever text/image was copied elsewhere.
const CLIP_MARKER = "⁣sigma-slide-elements⁣";

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.isContentEditable)
  );
}

/** The user deliberately highlighted page text — let the native copy win. */
function hasTextSelection(): boolean {
  const sel = window.getSelection();
  return !!sel && !sel.isCollapsed && !!sel.toString().trim();
}

/** Deep-clone elements with fresh ids (and fresh group ids), nudged by (dx, dy). */
function cloneElements(
  els: SlideElement[],
  dx: number,
  dy: number,
): SlideElement[] {
  const groups = new Map<string, string>();
  return els.map((el) => {
    const copy: SlideElement = {
      ...(JSON.parse(JSON.stringify(el)) as SlideElement),
      id: genId(),
      x: Math.round(el.x + dx),
      y: Math.round(el.y + dy),
    };
    if (el.groupId) {
      if (!groups.has(el.groupId)) groups.set(el.groupId, genId());
      copy.groupId = groups.get(el.groupId);
    }
    return copy;
  });
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
  const [uploading, setUploading] = useState(0);

  const slidesRef = useRef(slides);
  slidesRef.current = slides;
  const dirty = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshKnownRef = useRef<() => Promise<void>>(async () => {});
  const [deckChanged, setDeckChanged] = useState(false);
  // rendered text-box heights, measured by the canvas (align / layering need them)
  const heightsRef = useRef<Heights>({});

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
  const clipSlideId = useRef<string | null>(null);
  const pasteCount = useRef(0);
  const [hasClip, setHasClip] = useState(false);
  // set when a real copy/cut/paste event handled the shortcut
  const clipEventFired = useRef(false);

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

  // Capture the pre-edit state. Bursts (typing, sliders, arrow nudges) coalesce
  // into one step; finished gestures and commands always get their own step.
  const pushHistory = useCallback(
    (coalesce: boolean) => {
      const now = Date.now();
      if (!coalesce || now - lastEditAt.current > COALESCE_MS) {
        past.current.push(slidesRef.current);
        if (past.current.length > HISTORY_LIMIT) past.current.shift();
        future.current = [];
        syncHist();
      }
      lastEditAt.current = coalesce ? now : 0;
    },
    [syncHist],
  );

  const current = slides[Math.min(index, slides.length - 1)];
  const selectedEls = useMemo(
    () =>
      (current?.document.elements ?? []).filter((e) =>
        selectedIds.includes(e.id),
      ),
    [current, selectedIds],
  );
  // the "primary" element (last one added to the selection) drives the Inspector
  const primary = useMemo(() => {
    const id = selectedIds[selectedIds.length - 1];
    return current?.document.elements.find((e) => e.id === id) ?? null;
  }, [current, selectedIds]);

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
    (
      slideId: string,
      updater: (doc: SlideDocument) => SlideDocument,
      coalesce = true,
    ) => {
      pushHistory(coalesce);
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

  // patch several elements at once (one history step unless coalescing)
  const patchElements = useCallback(
    (patches: Patches, coalesce = true) => {
      if (!current || !Object.keys(patches).length) return;
      mutateDoc(
        current.id,
        (doc) => ({
          ...doc,
          elements: doc.elements.map((e) =>
            patches[e.id] ? ({ ...e, ...patches[e.id] } as SlideElement) : e,
          ),
        }),
        coalesce,
      );
    },
    [current, mutateDoc],
  );

  const updateElement = useCallback(
    (elId: string, patch: ElementPatch) => patchElements({ [elId]: patch }),
    [patchElements],
  );

  // a finished drag / resize / rotate / align is always its own undo step
  const commitPatches = useCallback(
    (patches: Patches) => patchElements(patches, false),
    [patchElements],
  );

  // add elements and select them; `onTop` stacks them above everything
  const addElements = useCallback(
    (els: SlideElement[], onTop = false) => {
      if (!current || !els.length) return;
      mutateDoc(
        current.id,
        (doc) => {
          let added = els;
          if (onTop) {
            const top = Math.max(0, ...doc.elements.map((e) => e.z ?? 1));
            const rank = new Map(paintOrder(els).map((e, i) => [e.id, i]));
            added = els.map((e) => ({ ...e, z: top + 1 + rank.get(e.id)! }));
          }
          return { ...doc, elements: [...doc.elements, ...added] };
        },
        false,
      );
      setSelectedIds(els.map((e) => e.id));
    },
    [current, mutateDoc],
  );

  const addElement = useCallback(
    (el: SlideElement) => addElements([el]),
    [addElements],
  );

  const deleteElement = useCallback(
    (elId: string) => {
      if (!current) return;
      mutateDoc(
        current.id,
        (doc) => ({
          ...doc,
          elements: doc.elements.filter((e) => e.id !== elId),
        }),
        false,
      );
      setSelectedIds((prev) => prev.filter((x) => x !== elId));
    },
    [current, mutateDoc],
  );

  // delete every selected element (Delete/Backspace, or cut)
  const deleteSelected = useCallback(() => {
    if (!current || !selectedIds.length) return;
    const ids = new Set(selectedIds);
    mutateDoc(
      current.id,
      (doc) => ({
        ...doc,
        elements: doc.elements.filter((e) => !ids.has(e.id)),
      }),
      false,
    );
    setSelectedIds([]);
  }, [current, mutateDoc, selectedIds]);

  // arrow-key nudge (coalesces while the key is held)
  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      const patches: Patches = {};
      for (const e of selectedEls) {
        if (!e.locked) patches[e.id] = { x: e.x + dx, y: e.y + dy };
      }
      patchElements(patches);
    },
    [patchElements, selectedEls],
  );

  const setBackground = useCallback(
    (bg: SlideBackground) => {
      if (!current) return;
      mutateDoc(current.id, (doc) => ({ ...doc, background: bg }));
    },
    [current, mutateDoc],
  );

  // upload dropped / pasted / picked files and drop them onto the slide
  const addFiles = useCallback(
    async (files: File[], at?: { x: number; y: number }) => {
      if (!files.length) return;
      setUploading((n) => n + 1);
      try {
        const els: SlideElement[] = [];
        for (const [i, file] of files.entries()) {
          const url = await uploadFile(file);
          if (!url) continue;
          const p = at ? { x: at.x + i * 24, y: at.y + i * 24 } : undefined;
          els.push(
            file.type.startsWith("video/")
              ? videoElementFor(url, p)
              : await imageElementFor(url, p),
          );
        }
        addElements(els, true);
      } finally {
        setUploading((n) => n - 1);
      }
    },
    [addElements],
  );

  const addPastedText = useCallback(
    (text: string) => {
      addElements(
        [
          {
            id: genId(),
            type: "text",
            text,
            role: "body",
            x: 340,
            y: 300,
            w: 600,
            fontFamily: "var(--font-sans)",
            fontSize: 28,
            fontWeight: 500,
            color: "#1c1407",
            align: "left",
            lineHeight: 1.3,
            anim: "up",
            z: 8,
          },
        ],
        true,
      );
    },
    [addElements],
  );

  // ---- selection commands (shortcuts, right-click menu, Inspector) ---------
  const copySelection = useCallback((): boolean => {
    if (!selectedEls.length || !current) return false;
    clipboard.current = JSON.parse(JSON.stringify(selectedEls));
    clipSlideId.current = current.id;
    pasteCount.current = 0;
    setHasClip(true);
    return true;
  }, [current, selectedEls]);

  const pasteClipboard = useCallback(() => {
    const clip = clipboard.current;
    if (!clip?.length || !current) return;
    // same slide: cascade each paste; another slide: first paste lands in place
    const n = ++pasteCount.current - (clipSlideId.current === current.id ? 0 : 1);
    addElements(cloneElements(clip, 24 * n, 24 * n), true);
  }, [addElements, current]);

  const duplicate = useCallback(() => {
    if (selectedEls.length) addElements(cloneElements(selectedEls, 24, 24), true);
  }, [addElements, selectedEls]);

  const selectAll = useCallback(() => {
    setSelectedIds(current?.document.elements.map((e) => e.id) ?? []);
  }, [current]);

  const group = useCallback(() => {
    if (selectedEls.length < 2) return;
    const gid = genId();
    commitPatches(
      Object.fromEntries(selectedEls.map((e) => [e.id, { groupId: gid }])),
    );
  }, [commitPatches, selectedEls]);

  const ungroup = useCallback(() => {
    commitPatches(
      Object.fromEntries(
        selectedEls
          .filter((e) => e.groupId)
          .map((e) => [e.id, { groupId: undefined }]),
      ),
    );
  }, [commitPatches, selectedEls]);

  const toggleLock = useCallback(() => {
    const lock = selectedEls.some((e) => !e.locked);
    commitPatches(
      Object.fromEntries(
        selectedEls.map((e) => [e.id, { locked: lock ? true : undefined }]),
      ),
    );
  }, [commitPatches, selectedEls]);

  const layer = useCallback(
    (move: LayerMove) => {
      if (!current || !selectedIds.length) return;
      const ids = new Set(selectedIds);
      mutateDoc(
        current.id,
        (doc) => {
          const z = restack(doc.elements, ids, move, heightsRef.current);
          return {
            ...doc,
            elements: doc.elements.map((e) => ({ ...e, z: z[e.id] })),
          };
        },
        false,
      );
    },
    [current, mutateDoc, selectedIds],
  );

  // one unit (an element or a group) aligns to the slide; several align to
  // their combined bounds
  const align = useCallback(
    (edge: AlignEdge) => {
      const h = heightsRef.current;
      const units = selectionUnits(selectedEls.filter((e) => !e.locked));
      if (!units.length) return;
      const ref =
        units.length === 1
          ? { x: 0, y: 0, w: STAGE_WIDTH, h: STAGE_HEIGHT }
          : unionBox(selectedEls.map((e) => boxOf(e, h)))!;
      const patches: Patches = {};
      for (const unit of units) {
        const b = unionBox(unit.map((e) => boxOf(e, h)))!;
        let dx = 0;
        let dy = 0;
        if (edge === "left") dx = ref.x - b.x;
        else if (edge === "hcenter") dx = ref.x + (ref.w - b.w) / 2 - b.x;
        else if (edge === "right") dx = ref.x + ref.w - b.w - b.x;
        else if (edge === "top") dy = ref.y - b.y;
        else if (edge === "vcenter") dy = ref.y + (ref.h - b.h) / 2 - b.y;
        else dy = ref.y + ref.h - b.h - b.y;
        dx = Math.round(dx);
        dy = Math.round(dy);
        for (const e of unit) patches[e.id] = { x: e.x + dx, y: e.y + dy };
      }
      commitPatches(patches);
    },
    [commitPatches, selectedEls],
  );

  // equal gaps between 3+ units along one axis
  const distribute = useCallback(
    (axis: "h" | "v") => {
      const h = heightsRef.current;
      const units = selectionUnits(selectedEls.filter((e) => !e.locked));
      if (units.length < 3) return;
      const pos = (b: { x: number; y: number }) => (axis === "h" ? b.x : b.y);
      const size = (b: { w: number; h: number }) => (axis === "h" ? b.w : b.h);
      const items = units
        .map((u) => ({ u, b: unionBox(u.map((e) => boxOf(e, h)))! }))
        .sort(
          (a, b) => pos(a.b) + size(a.b) / 2 - (pos(b.b) + size(b.b) / 2),
        );
      const first = items[0].b;
      const last = items[items.length - 1].b;
      const span = pos(last) + size(last) - pos(first);
      const total = items.reduce((sum, it) => sum + size(it.b), 0);
      const gap = (span - total) / (items.length - 1);
      const patches: Patches = {};
      let cursor = pos(first);
      for (const it of items) {
        const d = Math.round(cursor - pos(it.b));
        for (const e of it.u)
          patches[e.id] = axis === "h" ? { x: e.x + d } : { y: e.y + d };
        cursor += size(it.b) + gap;
      }
      commitPatches(patches);
    },
    [commitPatches, selectedEls],
  );

  const actions: EditorActions = useMemo(
    () => ({
      copy: () => {
        if (copySelection())
          navigator.clipboard?.writeText(CLIP_MARKER).catch(() => {});
      },
      cut: () => {
        if (copySelection()) {
          navigator.clipboard?.writeText(CLIP_MARKER).catch(() => {});
          deleteSelected();
        }
      },
      paste: pasteClipboard,
      canPaste: hasClip,
      duplicate,
      remove: deleteSelected,
      selectAll,
      group,
      ungroup,
      toggleLock,
      layer,
      align,
      distribute,
    }),
    [
      copySelection,
      deleteSelected,
      pasteClipboard,
      hasClip,
      duplicate,
      selectAll,
      group,
      ungroup,
      toggleLock,
      layer,
      align,
      distribute,
    ],
  );

  // keyboard shortcuts (Canva-style)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // let inputs / textareas / inline text editing keep their native shortcuts
      if (isTypingTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;

      // Delete / Backspace (no modifier) removes the selected element(s)
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        !mod &&
        !e.altKey
      ) {
        if (selectedIds.length) {
          e.preventDefault();
          deleteSelected();
        }
        return;
      }

      // arrows nudge 1px (Shift: 10px)
      if (!mod && e.key.startsWith("Arrow")) {
        if (!selectedIds.length) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        nudgeSelected(dx, dy);
        return;
      }

      if (e.key === "Escape") {
        if (selectedIds.length) setSelectedIds([]);
        return;
      }

      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      } else if (k === "a") {
        e.preventDefault();
        selectAll();
      } else if (k === "d") {
        if (selectedIds.length) {
          e.preventDefault();
          duplicate();
        }
      } else if (k === "g") {
        e.preventDefault();
        if (e.shiftKey) ungroup();
        else group();
      } else if (e.code === "BracketRight") {
        e.preventDefault();
        layer(e.shiftKey ? "front" : "forward");
      } else if (e.code === "BracketLeft") {
        e.preventDefault();
        layer(e.shiftKey ? "back" : "backward");
      } else if (k === "c" || k === "x" || k === "v") {
        // Normally the copy/cut/paste events below handle these. Some browsers
        // skip those events when nothing editable is focused, so fall back.
        if (k !== "v" && hasTextSelection()) return;
        clipEventFired.current = false;
        setTimeout(() => {
          if (clipEventFired.current) return;
          if (k === "c") copySelection();
          else if (k === "x") {
            if (copySelection()) deleteSelected();
          } else pasteClipboard();
        }, 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    undo,
    redo,
    selectedIds,
    deleteSelected,
    nudgeSelected,
    selectAll,
    duplicate,
    group,
    ungroup,
    layer,
    copySelection,
    pasteClipboard,
  ]);

  // clipboard: copy/cut our elements; paste ours, or images / text from outside
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target) || hasTextSelection() || !copySelection())
        return;
      clipEventFired.current = true;
      e.clipboardData?.setData("text/plain", CLIP_MARKER);
      e.preventDefault();
    };
    const onCut = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target) || hasTextSelection() || !copySelection())
        return;
      clipEventFired.current = true;
      e.clipboardData?.setData("text/plain", CLIP_MARKER);
      e.preventDefault();
      deleteSelected();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target)) return;
      clipEventFired.current = true;
      const data = e.clipboardData;
      const files = data
        ? [...data.files].filter((f) => /^(image|video)\//.test(f.type))
        : [];
      if (files.length) {
        e.preventDefault();
        addFiles(files);
        return;
      }
      const text = data?.getData("text/plain") ?? "";
      if (text === CLIP_MARKER || (!text.trim() && clipboard.current)) {
        e.preventDefault();
        pasteClipboard();
      } else if (text.trim()) {
        e.preventDefault();
        addPastedText(text.trim());
      }
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
    };
  }, [copySelection, deleteSelected, pasteClipboard, addFiles, addPastedText]);

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
            {uploading > 0
              ? "Uploading…"
              : saveState === "saving"
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
          key={current.id}
          slide={current}
          selectedIds={selectedIds}
          othersHere={othersHere}
          heightsRef={heightsRef}
          actions={actions}
          onSetSelection={setSelectedIds}
          onUpdateElement={updateElement}
          onCommitPatches={commitPatches}
          onDeleteElement={deleteElement}
          onDropFiles={addFiles}
        />

        <Inspector
          slide={current}
          selected={selectedEls}
          primary={primary}
          actions={actions}
          onUpdateElement={updateElement}
          onUpdateElements={patchElements}
          onDeleteElement={deleteElement}
          onAddElement={addElement}
          onAddFiles={addFiles}
          onSetBackground={setBackground}
        />
      </div>

      {presence.initialized && !presence.name && (
        <NamePrompt onSave={presence.setName} />
      )}
    </div>
  );
}
