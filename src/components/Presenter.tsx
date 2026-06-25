"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { PresentationData, SlideData } from "@/lib/types";
import { StageScaler } from "./stage/StageScaler";
import { SlideView } from "./stage/SlideView";
import { Confetti } from "./Confetti";
import { useDeckVersion } from "./useDeckVersion";

export function Presenter({
  slides: initialSlides,
  startIndex = 0,
}: {
  slides: SlideData[];
  startIndex?: number;
}) {
  const [slides, setSlides] = useState(initialSlides);
  const [index, setIndex] = useState(
    Math.min(Math.max(startIndex, 0), Math.max(initialSlides.length - 1, 0)),
  );

  // auto-refresh when the deck changes (e.g. a Slack update lands)
  useDeckVersion(async () => {
    try {
      const deck: PresentationData = await (
        await fetch("/api/presentation", { cache: "no-store" })
      ).json();
      setSlides(deck.slides);
      setIndex((i) => Math.min(i, deck.slides.length - 1));
    } catch {
      /* ignore */
    }
  });
  const [dir, setDir] = useState(1);
  const [isFs, setIsFs] = useState(false);
  const [auto, setAuto] = useState(false);
  const [showHint, setShowHint] = useState(true);

  const go = useCallback(
    (next: number) => {
      setIndex((cur) => {
        const clamped = Math.min(Math.max(next, 0), slides.length - 1);
        setDir(clamped >= cur ? 1 : -1);
        return clamped;
      });
    },
    [slides.length],
  );

  const toggleFs = useCallback(async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => {});
    } else {
      await document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", " ", "PageDown", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        go(index + 1);
      } else if (["ArrowLeft", "PageUp", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === "Home") {
        go(0);
      } else if (e.key === "End") {
        go(slides.length - 1);
      } else if (e.key.toLowerCase() === "f") {
        toggleFs();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go, slides.length, toggleFs]);

  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // auto-play: advance every 6.5s, loop back to the start
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => {
      setIndex((cur) => {
        const next = cur + 1 >= slides.length ? 0 : cur + 1;
        setDir(next >= cur ? 1 : -1);
        return next;
      });
    }, 6500);
    return () => clearTimeout(t);
  }, [auto, index, slides.length]);

  // fade the keyboard hint after a few seconds
  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 4500);
    return () => clearTimeout(t);
  }, []);

  if (!slides.length) {
    return (
      <div className="grid min-h-screen place-items-center text-white/70">
        No slides yet.
      </div>
    );
  }

  const slide = slides[index];

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-sigma-ink">
      {/* animated background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -left-40 top-0 h-[34rem] w-[34rem] rounded-full bg-sigma-amber/25 blur-3xl"
          animate={{ x: [0, 80, 0], y: [0, 60, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -right-40 top-1/3 h-[30rem] w-[30rem] rounded-full bg-sigma-orange/25 blur-3xl"
          animate={{ x: [0, -70, 0], y: [0, 80, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-0 left-1/3 h-[26rem] w-[26rem] rounded-full bg-sigma-yellow/20 blur-3xl"
          animate={{ x: [0, 60, 0], y: [0, -50, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* progress bar */}
      <div className="absolute inset-x-0 top-0 z-30 h-1 bg-white/10">
        <div
          className="sigma-gradient h-full transition-all duration-500"
          style={{ width: `${((index + 1) / slides.length) * 100}%` }}
        />
      </div>

      {/* celebration on the closing slide */}
      {slide.type === "THANKYOU" && <Confetti key={`confetti-${index}`} />}

      {/* top bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-4 text-white/80">
        <Link
          href="/"
          className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold backdrop-blur transition hover:bg-white/20"
        >
          ← Exit
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="tabular-nums">
            {index + 1} / {slides.length}
          </span>
          <button
            onClick={() => setAuto((a) => !a)}
            className={`rounded-full px-4 py-1.5 font-semibold backdrop-blur transition ${
              auto
                ? "bg-sigma-yellow text-sigma-ink"
                : "bg-white/10 hover:bg-white/20"
            }`}
          >
            {auto ? "❚❚ Auto" : "▶ Auto"}
          </button>
          <button
            onClick={toggleFs}
            className="rounded-full bg-white/10 px-4 py-1.5 font-semibold backdrop-blur transition hover:bg-white/20"
          >
            {isFs ? "Exit full screen" : "Full screen"}
          </button>
        </div>
      </div>

      {/* stage */}
      <div
        className={`relative z-10 flex flex-1 items-center justify-center ${
          isFs ? "" : "px-4 py-16 sm:px-10"
        }`}
      >
        <div
          className={isFs ? "" : "w-full max-w-[1200px]"}
          style={isFs ? { width: "min(100vw, calc(100vh * 16 / 9))" } : undefined}
        >
          <div
            className={`overflow-hidden ${
              isFs ? "" : "rounded-3xl shadow-slide ring-1 ring-white/10"
            }`}
          >
            <AnimatePresence mode="wait" custom={dir} initial={false}>
              <motion.div
                key={slide.id}
                custom={dir}
                initial={{ opacity: 0, x: dir * 80 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -80 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                <StageScaler rounded={false}>
                  <SlideView document={slide.document} animate />
                </StageScaler>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* click zones for prev/next */}
      <button
        aria-label="Previous slide"
        onClick={() => go(index - 1)}
        className="absolute inset-y-0 left-0 z-10 w-1/4 cursor-w-resize focus:outline-none"
      />
      <button
        aria-label="Next slide"
        onClick={() => go(index + 1)}
        className="absolute inset-y-0 right-0 z-10 w-1/4 cursor-e-resize focus:outline-none"
      />

      {/* keyboard hint */}
      {showHint && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center">
          <div className="rounded-full bg-white/10 px-4 py-1.5 text-xs text-white/70 backdrop-blur">
            ← → or space to navigate · F for full screen · ▶ Auto to loop
          </div>
        </div>
      )}

      {/* progress dots */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-2 pb-6">
        {slides.map((s, i) => (
          <button
            key={s.id}
            aria-label={`Go to slide ${i + 1}`}
            onClick={() => go(i)}
            className={`h-2 rounded-full transition-all ${
              i === index
                ? "w-8 bg-sigma-yellow"
                : "w-2 bg-white/30 hover:bg-white/60"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
