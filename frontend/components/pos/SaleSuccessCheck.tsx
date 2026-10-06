"use client";

import { motion } from "motion/react";
import { DURATION, EASE, useReducedMotionSafe } from "@/lib/motion";

/** A short check-mark that draws itself when a sale completes. Instant with reduced motion. */
export function SaleSuccessCheck() {
  const reduced = useReducedMotionSafe();
  return (
    <motion.div
      role="img"
      aria-label="Sale completed"
      className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 print:hidden"
      initial={reduced ? false : { scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: DURATION.base, ease: EASE.out }}
    >
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
        <motion.path
          d="M5 12.5l4.5 4.5L19 7.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: DURATION.slow, ease: EASE.out }}
        />
      </svg>
    </motion.div>
  );
}
