"use client";

import { useSyncExternalStore } from "react";

/** Desktop layout starts at Tailwind's `lg` breakpoint; below it the app uses the phone layout. */
export const DESKTOP_QUERY = "(min-width: 1024px)";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Live media-query match. Returns `serverValue` during SSR and the first client render
 * (hydration-safe), then the real value.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : serverValue),
    () => serverValue
  );
}

/** True on desktop widths (≥ 1024px). Defaults to desktop on the server. */
export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY, true);
}
