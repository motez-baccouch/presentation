"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Polls the deck "version" and fires `onChange` when it changes (i.e. someone
 * edited a slide or Slack added one). `refreshKnown()` resets the baseline —
 * call it after your own saves so they don't trigger `onChange`.
 */
export function useDeckVersion(onChange: () => void, intervalMs = 8000) {
  const known = useRef<string | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  const fetchVersion = useCallback(async (): Promise<string | null> => {
    try {
      const r = await fetch("/api/presentation/version", { cache: "no-store" });
      if (!r.ok) return null;
      const { v } = await r.json();
      return v as string;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      const v = await fetchVersion();
      if (!active || v === null) return;
      if (known.current === null) known.current = v;
      else if (v !== known.current) {
        known.current = v;
        cb.current();
      }
    };
    poll();
    const t = setInterval(poll, intervalMs);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [intervalMs, fetchVersion]);

  const refreshKnown = useCallback(async () => {
    const v = await fetchVersion();
    if (v !== null) known.current = v;
  }, [fetchVersion]);

  return { refreshKnown };
}
