"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  r: number;
  c: string;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  shape: 0 | 1;
}

/** A one-shot celebratory confetti burst over the whole viewport. */
export function Confetti({ duration = 2800 }: { duration?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = (canvas.width = window.innerWidth * dpr);
    const H = (canvas.height = window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;

    const colors = ["#fbbf09", "#f79009", "#f4691e", "#e8420e", "#ffffff"];
    const N = 170;
    const parts: Particle[] = Array.from({ length: N }, () => ({
      x: Math.random() * W,
      y: -Math.random() * H * 0.4,
      r: (6 + Math.random() * 9) * dpr,
      c: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 2.4 * dpr,
      vy: (2 + Math.random() * 4.5) * dpr,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.35,
      shape: Math.random() < 0.55 ? 0 : 1,
    }));

    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const elapsed = t - start;
      ctx.clearRect(0, 0, W, H);
      const fade =
        elapsed > duration ? Math.max(0, 1 - (elapsed - duration) / 700) : 1;
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05 * dpr;
        p.vx *= 0.995;
        p.rot += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = fade;
        ctx.fillStyle = p.c;
        if (p.shape === 0) {
          ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.r / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (elapsed < duration + 700) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration]);

  return (
    <canvas ref={ref} className="pointer-events-none fixed inset-0 z-40" />
  );
}
