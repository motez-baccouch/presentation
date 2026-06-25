"use client";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SlideData } from "@/lib/types";
import { SlideThumb } from "../SlideThumb";
import { getMember } from "@/lib/team";
import { Avatar } from "./Presence";

function thumbLabel(slide: SlideData, i: number): string {
  const member = slide.personKey ? getMember(slide.personKey) : null;
  if (member) return member.name.split(" ")[0];
  if (slide.type === "TITLE") return "Title";
  if (slide.type === "SUMMARY") return "Summary";
  if (slide.type === "THANKYOU") return "Thanks";
  return `Slide ${i + 1}`;
}

function SortableThumb({
  slide,
  i,
  active,
  editors,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  slide: SlideData;
  i: number;
  active: boolean;
  editors: string[];
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: slide.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="group relative"
    >
      <button
        onClick={onSelect}
        className={`flex w-full items-center gap-2 rounded-xl p-1.5 text-left transition ${
          active ? "bg-sigma-yellow/25 ring-2 ring-sigma-orange" : "hover:bg-white"
        }`}
      >
        <span className="w-4 shrink-0 text-center text-[11px] font-semibold text-sigma-ink/40">
          {i + 1}
        </span>
        <span
          {...attributes}
          {...listeners}
          className="relative flex-1 cursor-grab overflow-hidden rounded-lg border border-sigma-ink/10 active:cursor-grabbing"
        >
          <SlideThumb document={slide.document} />
          {editors.length > 0 && (
            <span className="absolute right-1 top-1 flex -space-x-1.5">
              {Array.from(new Set(editors)).slice(0, 3).map((n) => (
                <Avatar key={n} name={n} size={18} />
              ))}
            </span>
          )}
        </span>
      </button>
      <div className="pointer-events-none absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          className="pointer-events-auto grid h-6 w-6 place-items-center rounded-md bg-white/90 text-xs shadow-sm hover:bg-white"
          title="Duplicate"
        >
          ⧉
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="pointer-events-auto grid h-6 w-6 place-items-center rounded-md bg-white/90 text-xs text-sigma-red shadow-sm hover:bg-white"
          title="Delete"
        >
          ✕
        </span>
      </div>
      <div className="mt-0.5 pl-6 text-[11px] font-medium text-sigma-ink/50">
        {thumbLabel(slide, i)}
      </div>
    </div>
  );
}

export function SlideRail({
  slides,
  index,
  presenceBySlide,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onReorder,
}: {
  slides: SlideData[];
  index: number;
  presenceBySlide: Record<string, string[]>;
  onSelect: (i: number) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = slides.findIndex((s) => s.id === active.id);
    const newIndex = slides.findIndex((s) => s.id === over.id);
    const next = arrayMove(slides, oldIndex, newIndex);
    onReorder(next.map((s) => s.id));
  }

  return (
    <aside className="thin-scroll flex w-48 shrink-0 flex-col gap-1 overflow-y-auto border-r border-sigma-ink/10 bg-sigma-sand p-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={slides.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          {slides.map((slide, i) => (
            <SortableThumb
              key={slide.id}
              slide={slide}
              i={i}
              active={i === index}
              editors={presenceBySlide[slide.id] ?? []}
              onSelect={() => onSelect(i)}
              onDuplicate={() => onDuplicate(slide.id)}
              onDelete={() => onDelete(slide.id)}
            />
          ))}
        </SortableContext>
      </DndContext>

      <button
        onClick={onAdd}
        className="mt-2 rounded-xl border-2 border-dashed border-sigma-ink/20 py-3 text-sm font-semibold text-sigma-ink/60 transition hover:border-sigma-orange hover:text-sigma-orange"
      >
        + Add slide
      </button>
    </aside>
  );
}
