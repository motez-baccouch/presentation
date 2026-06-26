"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Rnd } from "react-rnd";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  SlideData,
  SlideElement,
  TextElement,
  STAGE_WIDTH,
  STAGE_HEIGHT,
} from "@/lib/types";
import {
  StageBackground,
  ImageContent,
  VideoContent,
  ShapeContent,
  textStyle,
} from "../stage/elements";
import { EditingHereBadge } from "./Presence";

function TextEditable({
  el,
  editing,
  onInput,
  onStopEditing,
}: {
  el: TextElement;
  editing: boolean;
  onInput: (text: string) => void;
  onStopEditing: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (ref.current) ref.current.innerText = el.text;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      ref.current &&
      document.activeElement !== ref.current &&
      ref.current.innerText !== el.text
    ) {
      ref.current.innerText = el.text;
    }
  }, [el.text]);

  useEffect(() => {
    if (editing && ref.current) {
      const node = ref.current;
      node.focus();
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editing]);

  return (
    <div
      ref={ref}
      contentEditable={editing}
      suppressContentEditableWarning
      onInput={(e) => onInput(e.currentTarget.innerText)}
      onBlur={onStopEditing}
      style={{
        ...textStyle(el),
        width: "100%",
        cursor: editing ? "text" : "inherit",
        outline: "none",
      }}
    />
  );
}

export function EditorCanvas({
  slide,
  selectedIds,
  othersHere = [],
  onSelect,
  onUpdateElement,
  onNudgeSelected,
  onDeleteElement,
}: {
  slide: SlideData;
  selectedIds: string[];
  othersHere?: string[];
  onSelect: (id: string | null, additive?: boolean) => void;
  onUpdateElement: (id: string, patch: Partial<SlideElement>) => void;
  onNudgeSelected: (dx: number, dy: number) => void;
  onDeleteElement: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const rotateRef = useRef<{ id: string; cx: number; cy: number } | null>(null);

  useLayoutEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const update = () => setScale(node.clientWidth / STAGE_WIDTH);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setEditingId(null);
  }, [slide.id]);

  // ---- rotation interaction ------------------------------------------------
  const onRotateMove = useCallback(
    (e: PointerEvent) => {
      const st = rotateRef.current;
      if (!st) return;
      let ang =
        Math.atan2(e.clientY - st.cy, e.clientX - st.cx) * (180 / Math.PI) + 90;
      if (e.shiftKey) ang = Math.round(ang / 15) * 15; // snap with Shift
      onUpdateElement(st.id, { rotation: Math.round(ang) });
    },
    [onUpdateElement],
  );

  const onRotateUp = useCallback(() => {
    rotateRef.current = null;
    setRotatingId(null);
    window.removeEventListener("pointermove", onRotateMove);
    window.removeEventListener("pointerup", onRotateUp);
  }, [onRotateMove]);

  const startRotate = useCallback(
    (e: ReactPointerEvent, el: SlideElement) => {
      e.stopPropagation();
      e.preventDefault();
      const box = (
        e.currentTarget.parentElement as HTMLElement
      ).getBoundingClientRect();
      rotateRef.current = {
        id: el.id,
        cx: box.left + box.width / 2,
        cy: box.top + box.height / 2,
      };
      setRotatingId(el.id);
      onSelect(el.id);
      window.addEventListener("pointermove", onRotateMove);
      window.addEventListener("pointerup", onRotateUp);
    },
    [onRotateMove, onRotateUp, onSelect],
  );

  useEffect(
    () => () => {
      window.removeEventListener("pointermove", onRotateMove);
      window.removeEventListener("pointerup", onRotateUp);
    },
    [onRotateMove, onRotateUp],
  );

  const deselect = () => {
    onSelect(null);
    setEditingId(null);
  };

  const ordered = [...slide.document.elements].sort(
    (a, b) => (a.z ?? 1) - (b.z ?? 1),
  );

  // keep on-canvas controls a constant screen size despite the stage scale
  const cs = scale > 0 ? 1 / scale : 1;
  const c = (px: number) => px * cs;

  const handleStyle = (extra: CSSProperties): CSSProperties => ({
    width: c(13),
    height: c(13),
    background: "#fff",
    border: `${c(2)}px solid #f4691e`,
    borderRadius: c(3),
    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
    ...extra,
  });

  return (
    <section className="thin-scroll relative flex flex-1 items-center justify-center overflow-auto bg-sigma-sand p-6">
      <EditingHereBadge names={othersHere} />
      <div
        ref={wrapRef}
        className="relative w-full max-w-[1000px] overflow-hidden rounded-2xl bg-white shadow-slide"
        style={{ aspectRatio: `${STAGE_WIDTH} / ${STAGE_HEIGHT}` }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) deselect();
        }}
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
            <StageBackground bg={slide.document.background} />
            {/* click-catcher: clicking empty canvas deselects everything */}
            <div
              style={{ position: "absolute", inset: 0, zIndex: 0 }}
              onMouseDown={deselect}
            />

            {ordered.map((el) => {
              const selected = selectedIds.includes(el.id);
              // resize/rotate/delete controls only when this is the sole selection
              const solo = selectedIds.length === 1 && selectedIds[0] === el.id;
              const isText = el.type === "text";
              // inline editing only while this is the sole selection
              const editing = el.id === editingId && solo;
              const rotating = el.id === rotatingId;
              const height = isText ? "auto" : (el as { h: number }).h;

              const resizeHandleStyles = solo
                ? {
                    topLeft: handleStyle({ left: -c(7), top: -c(7) }),
                    topRight: handleStyle({ right: -c(7), top: -c(7) }),
                    bottomLeft: handleStyle({ left: -c(7), bottom: -c(7) }),
                    bottomRight: handleStyle({ right: -c(7), bottom: -c(7) }),
                    left: handleStyle({ left: -c(7), top: "50%", marginTop: -c(7) }),
                    right: handleStyle({ right: -c(7), top: "50%", marginTop: -c(7) }),
                  }
                : undefined;

              return (
                <Rnd
                  key={el.id}
                  scale={scale}
                  bounds="parent"
                  cancel=".no-drag"
                  size={{ width: el.w, height }}
                  position={{ x: el.x, y: el.y }}
                  disableDragging={editing || rotating}
                  enableResizing={
                    solo
                      ? isText
                        ? { left: true, right: true }
                        : {
                            top: true,
                            right: true,
                            bottom: true,
                            left: true,
                            topRight: true,
                            bottomRight: true,
                            bottomLeft: true,
                            topLeft: true,
                          }
                      : false
                  }
                  resizeHandleStyles={resizeHandleStyles}
                  minWidth={24}
                  minHeight={isText ? undefined : 16}
                  style={{
                    zIndex: el.z ?? 1,
                    outline: selected
                      ? `${c(2)}px solid #f4691e`
                      : "1px solid transparent",
                    outlineOffset: c(2),
                    cursor: editing ? "text" : "move",
                  }}
                  onMouseDown={(e) =>
                    onSelect(el.id, e.ctrlKey || e.metaKey || e.shiftKey)
                  }
                  onDragStart={() => {
                    if (!selected) onSelect(el.id);
                  }}
                  onDragStop={(_e, d) => {
                    const nx = Math.round(d.x);
                    const ny = Math.round(d.y);
                    if (selectedIds.length > 1 && selected) {
                      // move the whole selection by the same delta
                      onNudgeSelected(nx - el.x, ny - el.y);
                    } else {
                      onUpdateElement(el.id, { x: nx, y: ny });
                    }
                  }}
                  onResizeStop={(_e, _dir, ref, _delta, pos) => {
                    const patch: Partial<SlideElement> = {
                      w: Math.round(ref.offsetWidth),
                      x: Math.round(pos.x),
                      y: Math.round(pos.y),
                    };
                    if (!isText) {
                      (patch as { h: number }).h = Math.round(ref.offsetHeight);
                    }
                    onUpdateElement(el.id, patch);
                  }}
                  onDoubleClick={() => {
                    if (isText) {
                      onSelect(el.id);
                      setEditingId(el.id);
                    }
                  }}
                >
                  <div style={{ position: "relative", width: "100%", height: "100%" }}>
                    {/* rotated content */}
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        transform: el.rotation
                          ? `rotate(${el.rotation}deg)`
                          : undefined,
                        transformOrigin: "center",
                      }}
                    >
                      {el.type === "text" ? (
                        <TextEditable
                          el={el}
                          editing={editing}
                          onInput={(text) => onUpdateElement(el.id, { text })}
                          onStopEditing={() => setEditingId(null)}
                        />
                      ) : el.type === "image" ? (
                        <ImageContent el={el} />
                      ) : el.type === "video" ? (
                        <VideoContent el={el} play={false} />
                      ) : (
                        <ShapeContent el={el} />
                      )}
                    </div>

                    {/* on-element controls (only for a single selection) */}
                    {solo && !editing && (
                      <>
                        <div
                          className="no-drag"
                          title="Rotate (hold Shift to snap)"
                          onPointerDown={(e) => startRotate(e, el)}
                          style={{
                            position: "absolute",
                            top: -c(42),
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: c(26),
                            height: c(26),
                            borderRadius: "9999px",
                            background: "#fff",
                            border: `${c(2)}px solid #f4691e`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: c(15),
                            color: "#f4691e",
                            cursor: "grab",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                            zIndex: 3,
                          }}
                        >
                          ⟳
                        </div>
                        <button
                          className="no-drag"
                          title="Delete"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteElement(el.id);
                          }}
                          style={{
                            position: "absolute",
                            top: -c(13),
                            right: -c(13),
                            width: c(26),
                            height: c(26),
                            borderRadius: "9999px",
                            background: "#e8420e",
                            color: "#fff",
                            border: `${c(2)}px solid #fff`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: c(16),
                            lineHeight: 1,
                            cursor: "pointer",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
                            zIndex: 3,
                          }}
                        >
                          ×
                        </button>
                      </>
                    )}
                  </div>
                </Rnd>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
