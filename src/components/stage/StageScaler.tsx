"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { STAGE_WIDTH, STAGE_HEIGHT } from "@/lib/types";

/**
 * Renders children inside a fixed 1280x720 stage that is CSS-scaled to fill the
 * width of its parent while preserving the 16:9 aspect ratio. Element
 * coordinates everywhere are in stage pixels; this component handles the scale.
 */
export function StageScaler({
  children,
  className = "",
  rounded = true,
}: {
  children: React.ReactNode;
  className?: string;
  rounded?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / STAGE_WIDTH);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      className={`relative w-full overflow-hidden ${rounded ? "rounded-2xl" : ""} ${className}`}
      style={{ aspectRatio: `${STAGE_WIDTH} / ${STAGE_HEIGHT}` }}
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
          {children}
        </div>
      )}
    </div>
  );
}
