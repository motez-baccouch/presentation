"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Rnd } from "react-rnd";
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
  selectedId,
  onSelect,
  onUpdateElement,
}: {
  slide: SlideData;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdateElement: (id: string, patch: Partial<SlideElement>) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  useLayoutEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const update = () => setScale(node.clientWidth / STAGE_WIDTH);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // leaving a slide / changing selection stops text editing
  useEffect(() => {
    setEditingId(null);
  }, [slide.id]);
  useEffect(() => {
    if (selectedId !== editingId) setEditingId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const ordered = [...slide.document.elements].sort(
    (a, b) => (a.z ?? 1) - (b.z ?? 1),
  );

  return (
    <section className="thin-scroll flex flex-1 items-center justify-center overflow-auto bg-sigma-sand p-6">
      <div
        ref={wrapRef}
        className="relative w-full max-w-[1000px] overflow-hidden rounded-2xl bg-white shadow-slide"
        style={{ aspectRatio: `${STAGE_WIDTH} / ${STAGE_HEIGHT}` }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onSelect(null);
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
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) onSelect(null);
            }}
          >
            <StageBackground bg={slide.document.background} />

            {ordered.map((el) => {
              const selected = el.id === selectedId;
              const isText = el.type === "text";
              const editing = el.id === editingId;
              const height = isText ? "auto" : (el as { h: number }).h;

              return (
                <Rnd
                  key={el.id}
                  scale={scale}
                  bounds="parent"
                  size={{ width: el.w, height }}
                  position={{ x: el.x, y: el.y }}
                  disableDragging={editing}
                  enableResizing={
                    selected
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
                  minWidth={24}
                  minHeight={isText ? undefined : 16}
                  style={{
                    zIndex: el.z ?? 1,
                    outline: selected
                      ? "2px solid #f4691e"
                      : "1px solid transparent",
                    outlineOffset: 2,
                    cursor: editing ? "text" : "move",
                  }}
                  onMouseDown={() => onSelect(el.id)}
                  onDragStart={() => onSelect(el.id)}
                  onDragStop={(_e, d) =>
                    onUpdateElement(el.id, { x: Math.round(d.x), y: Math.round(d.y) })
                  }
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
                  <div style={{ width: "100%", height: "100%" }}>
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
                </Rnd>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
