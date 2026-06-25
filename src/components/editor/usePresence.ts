"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ActiveEditor {
  id: string;
  name: string;
  slideId: string | null;
}

/**
 * Lightweight "who's editing" presence over a polling heartbeat. Each browser
 * gets a stable client id; the editor's name is stored in localStorage.
 */
export function usePresence(currentSlideId: string | null) {
  const [name, setNameState] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [others, setOthers] = useState<ActiveEditor[]>([]);
  const idRef = useRef("");
  const nameRef = useRef("");
  const slideRef = useRef<string | null>(currentSlideId);
  slideRef.current = currentSlideId;

  useEffect(() => {
    let id = localStorage.getItem("sigma_client_id");
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "c" + Math.random().toString(36).slice(2);
      localStorage.setItem("sigma_client_id", id);
    }
    idRef.current = id;
    const n = localStorage.getItem("sigma_editor_name") ?? "";
    nameRef.current = n;
    setNameState(n);
    setInitialized(true);
  }, []);

  const setName = useCallback((n: string) => {
    const clean = n.trim().slice(0, 40);
    localStorage.setItem("sigma_editor_name", clean);
    nameRef.current = clean;
    setNameState(clean);
  }, []);

  const beat = useCallback(async () => {
    if (!idRef.current || !nameRef.current) return;
    try {
      const res = await fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: idRef.current,
          name: nameRef.current,
          slideId: slideRef.current,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setOthers(
          (data.active ?? []).filter(
            (e: ActiveEditor) => e.id !== idRef.current,
          ),
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!initialized || !name) return;
    beat();
    const t = setInterval(beat, 8000);
    return () => clearInterval(t);
  }, [initialized, name, beat]);

  // refresh immediately when switching slides
  useEffect(() => {
    if (name) beat();
  }, [currentSlideId, name, beat]);

  return { name, setName, initialized, others };
}
