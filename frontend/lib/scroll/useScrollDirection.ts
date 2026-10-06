"use client";

import { useEffect, useState } from "react";

/** Below this scroll offset the page counts as "at the top": the direction is always "up". */
const TOP_ZONE = 64;

/**
 * Which way the window is being scrolled. Used to hide the phone chrome while reading and
 * bring it back when the user scrolls up. Changes smaller than `threshold` px are ignored so
 * a jittery finger doesn't flicker the chrome. Near the top or at the bottom of the page it is
 * always "up" (the chrome should be visible there). SSR-safe: "up".
 */
export function useScrollDirection(opts?: { threshold?: number }): "up" | "down" {
  const threshold = opts?.threshold ?? 12;
  const [direction, setDirection] = useState<"up" | "down">("up");

  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;

    function update() {
      frame = 0;
      const y = window.scrollY;
      const atBottom = y + window.innerHeight >= document.documentElement.scrollHeight - 2;
      if (y < TOP_ZONE || atBottom) {
        setDirection("up");
        lastY = y;
        return;
      }
      if (Math.abs(y - lastY) < threshold) return;
      setDirection(y > lastY ? "down" : "up");
      lastY = y;
    }

    function onScroll() {
      if (frame) return;
      frame = requestAnimationFrame(update);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return direction;
}
