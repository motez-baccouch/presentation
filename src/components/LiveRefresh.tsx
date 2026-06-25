"use client";

import { useRouter } from "next/navigation";
import { useDeckVersion } from "./useDeckVersion";

/** Drop into a server page to re-render it when the deck changes. */
export function LiveRefresh() {
  const router = useRouter();
  useDeckVersion(() => router.refresh());
  return null;
}
