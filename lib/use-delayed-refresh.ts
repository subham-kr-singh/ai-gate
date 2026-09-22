"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * `router.refresh()` re-renders the subtree from the server, which remounts the
 * client component that called it. A success banner set just before the refresh
 * is therefore destroyed before anyone can read it. Route the refresh through
 * this hook so the confirmation stays on screen briefly and the fresh server
 * data lands behind it.
 *
 * Pass `immediate` for flows that redirect or have no message to preserve.
 */
export function useDelayedRefresh(delayMs = 2500) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return (immediate = false) => {
    if (timer.current) clearTimeout(timer.current);
    if (immediate) {
      router.refresh();
      return;
    }
    timer.current = setTimeout(() => router.refresh(), delayMs);
  };
}
