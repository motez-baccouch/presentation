"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push(next || "/edit");
      router.refresh();
    } else {
      setError("That password didn't work.");
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm">
      <label className="mb-2 block text-sm font-semibold text-sigma-ink/70">
        Team password
      </label>
      <input
        type="password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
        className="w-full rounded-xl border border-sigma-ink/15 bg-white px-4 py-3 text-sigma-ink outline-none ring-sigma-orange/40 transition focus:ring-2"
      />
      {error && <p className="mt-2 text-sm text-sigma-red">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="sigma-gradient mt-5 w-full rounded-xl py-3 font-semibold text-white shadow-card transition hover:brightness-105 disabled:opacity-60"
      >
        {loading ? "Checking…" : "Enter editor"}
      </button>
    </form>
  );
}
