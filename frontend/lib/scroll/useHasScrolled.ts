"use client";

import { useEffect, useState } from "react";

/** True once the window has scrolled more than `offset` px (e.g. to give the TopBar a shadow). */
export function useHasScrolled(offset = 8): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;

    function update() {
      frame = 0;
      setScrolled(window.scrollY > offset);
    }

    function onScroll() {
      if (frame) return;
      frame = requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [offset]);

  return scrolled;
}
