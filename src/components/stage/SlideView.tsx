"use client";

import { motion, type Variants } from "framer-motion";
import { SlideDocument, SlideElement } from "@/lib/types";
import {
  StageBackground,
  TextContent,
  ImageContent,
  VideoContent,
  ShapeContent,
} from "./elements";
import type { CSSProperties } from "react";

function wrapperStyle(el: SlideElement): CSSProperties {
  const base: CSSProperties = {
    position: "absolute",
    left: el.x,
    top: el.y,
    width: el.w,
    zIndex: el.z ?? 1,
  };
  if (el.type === "image" || el.type === "shape" || el.type === "video")
    base.height = el.h;
  if (el.type === "text" && el.h) base.height = el.h;
  return base;
}

function ElementContent({ el, play }: { el: SlideElement; play: boolean }) {
  if (el.type === "text") return <TextContent el={el} />;
  if (el.type === "image") return <ImageContent el={el} />;
  if (el.type === "video") return <VideoContent el={el} play={play} />;
  return <ShapeContent el={el} />;
}

const DIST = 44;
const VARIANTS: Record<string, Variants> = {
  fade: { hidden: { opacity: 0 }, show: { opacity: 1 } },
  up: { hidden: { opacity: 0, y: DIST }, show: { opacity: 1, y: 0 } },
  left: { hidden: { opacity: 0, x: -DIST }, show: { opacity: 1, x: 0 } },
  right: { hidden: { opacity: 0, x: DIST }, show: { opacity: 1, x: 0 } },
  pop: { hidden: { opacity: 0, scale: 0.7 }, show: { opacity: 1, scale: 1 } },
  none: { hidden: {}, show: {} },
};

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.12 } },
};

export function SlideView({
  document: doc,
  animate = false,
}: {
  document: SlideDocument;
  animate?: boolean;
}) {
  const ordered = [...doc.elements].sort((a, b) => (a.z ?? 1) - (b.z ?? 1));

  if (!animate) {
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <StageBackground bg={doc.background} />
        {ordered.map((el) => (
          <div key={el.id} style={wrapperStyle(el)}>
            <ElementContent el={el} play={false} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <StageBackground bg={doc.background} />
      <motion.div
        style={{ position: "absolute", inset: 0 }}
        variants={container}
        initial="hidden"
        animate="show"
      >
        {ordered.map((el) => (
          <motion.div
            key={el.id}
            style={wrapperStyle(el)}
            variants={VARIANTS[el.anim ?? "up"] ?? VARIANTS.up}
            transition={
              (el.anim ?? "up") === "pop"
                ? { type: "spring", stiffness: 220, damping: 18 }
                : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }
            }
          >
            <ElementContent el={el} play={animate} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
