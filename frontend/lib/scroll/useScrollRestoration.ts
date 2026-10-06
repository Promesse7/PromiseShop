"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const KEY_PREFIX = "promiseshop.scroll.";
/** How long to keep retrying a restore while the page content is still rendering. */
const RESTORE_WINDOW_MS = 1000;

function routeKey(pathname: string): string {
  const search = typeof window !== "undefined" ? window.location.search : "";
  return `${KEY_PREFIX}${pathname}${search}`;
}

function save(key: string, y: number) {
  try {
    sessionStorage.setItem(key, String(Math.round(y)));
  } catch {
    // Private mode / blocked storage: restoring just won't happen.
  }
}

function read(key: string): number | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

function scrollInstant(top: number) {
  window.scrollTo({ top, left: 0, behavior: "instant" as ScrollBehavior });
}

/**
 * Per-page scroll memory, mounted once in the AppShell. A page reached by a normal link opens
 * at the top; Back/Forward returns to where the user was on that page (e.g. the same spot in
 * a long product list). Positions live in sessionStorage per pathname+search.
 */
export function useScrollRestoration(): void {
  const pathname = usePathname();
  const keyRef = useRef<string | null>(null);
  const poppedRef = useRef(false);

  // Take over from the browser, which restores too early for client-rendered content.
  useEffect(() => {
    try {
      history.scrollRestoration = "manual";
    } catch {
      // Very old browsers: they keep their own restoration.
    }
    function onPopState() {
      poppedRef.current = true;
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Keep the current page's position saved as the user scrolls.
  useEffect(() => {
    let frame = 0;
    function onScroll() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (keyRef.current) save(keyRef.current, window.scrollY);
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // On each page change: restore on Back/Forward, otherwise start at the top.
  useEffect(() => {
    const key = routeKey(pathname);
    keyRef.current = key;
    const popped = poppedRef.current;
    poppedRef.current = false;

    const target = popped ? read(key) : null;
    if (target === null || target <= 0) {
      scrollInstant(0);
      return;
    }

    // Content may still be rendering: retry until the page is tall enough or time runs out.
    const started = Date.now();
    let frame = 0;
    function attempt() {
      frame = 0;
      const maxY = document.documentElement.scrollHeight - window.innerHeight;
      if (maxY >= (target as number) || Date.now() - started > RESTORE_WINDOW_MS) {
        scrollInstant(Math.min(target as number, Math.max(maxY, 0)));
        return;
      }
      frame = requestAnimationFrame(attempt);
    }
    attempt();
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname]);
}
