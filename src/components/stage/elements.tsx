import {
  SlideBackground,
  TextElement,
  ImageElement,
  VideoElement,
  ShapeElement,
  STAGE_WIDTH,
  STAGE_HEIGHT,
} from "@/lib/types";
import type { CSSProperties } from "react";

export function backgroundStyle(bg: SlideBackground): CSSProperties {
  if (bg.kind === "gradient") {
    return {
      backgroundImage: `linear-gradient(${bg.angle ?? 135}deg, ${bg.from ?? "#f79009"}, ${bg.to ?? "#e8420e"})`,
    };
  }
  if (bg.kind === "mesh") {
    return {
      backgroundColor: "#fff8ea",
      backgroundImage: [
        "radial-gradient(at 18% 22%, rgba(251,191,9,0.45) 0px, transparent 55%)",
        "radial-gradient(at 82% 12%, rgba(244,105,30,0.40) 0px, transparent 50%)",
        "radial-gradient(at 70% 88%, rgba(247,144,9,0.35) 0px, transparent 55%)",
        "radial-gradient(at 12% 82%, rgba(232,66,14,0.28) 0px, transparent 50%)",
      ].join(","),
    };
  }
  return { backgroundColor: bg.color ?? "#fff8ea" };
}

export function StageBackground({ bg }: { bg: SlideBackground }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
        ...backgroundStyle(bg),
      }}
    />
  );
}

export function textStyle(el: TextElement): CSSProperties {
  return {
    fontFamily: el.fontFamily,
    fontSize: el.fontSize,
    fontWeight: el.fontWeight,
    color: el.color,
    textAlign: el.align,
    lineHeight: el.lineHeight ?? 1.3,
    letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : undefined,
    textTransform: el.uppercase ? "uppercase" : "none",
    fontStyle: el.italic ? "italic" : "normal",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    margin: 0,
  };
}

export function TextContent({ el }: { el: TextElement }) {
  return <p style={textStyle(el)}>{el.text}</p>;
}

export function ImageContent({ el }: { el: ImageElement }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={el.url}
      alt=""
      draggable={false}
      style={{
        width: "100%",
        height: "100%",
        objectFit: el.fit ?? "cover",
        borderRadius: el.circle ? "9999px" : (el.radius ?? 0),
        boxShadow: el.shadow ? "0 18px 40px -12px rgba(28,20,7,0.45)" : undefined,
        display: "block",
        userSelect: "none",
      }}
    />
  );
}

export function VideoContent({
  el,
  play = true,
}: {
  el: VideoElement;
  play?: boolean;
}) {
  return (
    <video
      src={el.url}
      poster={el.poster}
      controls={el.controls}
      autoPlay={play && (el.autoplay ?? true)}
      loop={el.loop ?? true}
      muted={el.muted ?? true}
      playsInline
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        borderRadius: el.radius ?? 12,
        boxShadow: el.shadow ? "0 18px 40px -12px rgba(28,20,7,0.45)" : undefined,
        display: "block",
        background: "#000",
      }}
    />
  );
}

export function ShapeContent({ el }: { el: ShapeElement }) {
  const base: CSSProperties = {
    width: "100%",
    height: "100%",
    background: el.fill,
    opacity: el.opacity ?? 1,
  };
  if (el.kind === "triangle") {
    return <div style={{ ...base, clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }} />;
  }
  if (el.kind === "blob") {
    return (
      <div
        style={{
          ...base,
          borderRadius: "42% 58% 63% 37% / 47% 38% 62% 53%",
          filter: "blur(8px)",
        }}
      />
    );
  }
  if (el.kind === "line") {
    return <div style={{ ...base, borderRadius: el.radius ?? 2 }} />;
  }
  return <div style={{ ...base, borderRadius: el.radius ?? 0 }} />;
}

export { STAGE_WIDTH, STAGE_HEIGHT };
