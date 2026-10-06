"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp } from "lucide-react";
import { DURATION, EASE, useReducedMotionSafe } from "@/lib/motion";
import { useIsDesktop } from "@/lib/useMediaQuery";
import { useStickyBottomOffset } from "@/lib/scroll/chrome";

/** Shows once the user is about two screens down a long page. */
function useFarDown(): boolean {
  const [far, setFar] = useState(false);
  useEffect(() => {
    let frame = 0;
    function update() {
      frame = 0;
      setFar(window.scrollY > window.innerHeight * 2);
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
  }, []);
  return far;
}

/** Floating "back to top" button for long pages. Mounted once in the AppShell. */
export function BackToTop() {
  const far = useFarDown();
  const reduced = useReducedMotionSafe();
  const desktop = useIsDesktop();
  const offset = useStickyBottomOffset();
  const bottom = desktop ? "24px" : `calc(${offset + 16}px + env(safe-area-inset-bottom))`;

  function toTop() {
    window.scrollTo({ top: 0, left: 0, behavior: (reduced ? "instant" : "smooth") as ScrollBehavior });
  }

  return (
    <AnimatePresence>
      {far && (
        <motion.button
          type="button"
          aria-label="Back to top"
          onClick={toTop}
          initial={reduced ? false : { opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.8 }}
          transition={{ duration: DURATION.fast, ease: EASE.out }}
          style={{ bottom }}
          className="print:hidden fixed right-4 lg:right-6 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-accent text-white shadow-md hover:shadow-glow-md transition-[bottom,box-shadow] duration-200"
        >
          <ArrowUp className="h-5 w-5" aria-hidden />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
