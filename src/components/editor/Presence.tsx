"use client";

import { useState } from "react";
import { ActiveEditor } from "./usePresence";

const COLORS = ["#f79009", "#f4691e", "#e8420e", "#fbbf09", "#2f7d6b", "#7b5cd6"];

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  return (
    <span
      title={name}
      style={{ width: size, height: size, background: colorFor(name) }}
      className="inline-grid place-items-center rounded-full text-[11px] font-bold text-white ring-2 ring-white"
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function PresencePills({ others }: { others: ActiveEditor[] }) {
  if (!others.length) return null;
  // unique by name
  const seen = new Set<string>();
  const people = others.filter((o) =>
    seen.has(o.name) ? false : (seen.add(o.name), true),
  );
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex -space-x-2">
        {people.slice(0, 5).map((p) => (
          <Avatar key={p.id} name={p.name} />
        ))}
      </div>
      <span className="hidden text-xs font-medium text-sigma-ink/50 lg:inline">
        {people.length === 1
          ? `${people[0].name} is here`
          : `${people.length} people editing`}
      </span>
    </div>
  );
}

export function NamePrompt({ onSave }: { onSave: (name: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-sigma-ink/40 backdrop-blur-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSave(value);
        }}
        className="w-full max-w-sm rounded-3xl border border-sigma-ink/10 bg-white p-7 shadow-slide"
      >
        <h2 className="font-display text-xl font-bold text-sigma-ink">
          What's your name?
        </h2>
        <p className="mt-1 mb-4 text-sm text-sigma-ink/60">
          So the team can see who's editing.
        </p>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Motez"
          className="w-full rounded-xl border border-sigma-ink/15 px-4 py-3 outline-none ring-sigma-orange/40 transition focus:ring-2"
        />
        <button
          type="submit"
          className="sigma-gradient mt-4 w-full rounded-xl py-3 font-semibold text-white shadow-card transition hover:brightness-105"
        >
          Start editing
        </button>
      </form>
    </div>
  );
}

export function EditingHereBadge({ names }: { names: string[] }) {
  if (!names.length) return null;
  const seen = new Set<string>();
  const unique = names.filter((n) => (seen.has(n) ? false : (seen.add(n), true)));
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full bg-sigma-ink/85 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
        <span className="flex -space-x-1.5">
          {unique.slice(0, 3).map((n) => (
            <Avatar key={n} name={n} size={20} />
          ))}
        </span>
        {unique.length === 1
          ? `${unique[0]} is also on this slide`
          : `${unique.join(", ")} are on this slide`}
      </div>
    </div>
  );
}
