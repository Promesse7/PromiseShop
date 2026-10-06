"use client";

import { useEffect, useRef, useState } from "react";
import type { Transition, Variants } from "motion/react";
import { REDUCED_MOTION_QUERY, useMediaQuery } from "./useMediaQuery";

/**
 * The app's single source of motion timing. Nothing animates longer than 300ms, and only
 * transform/opacity are animated (the sidebar width is the one exception, in the shell).
 */
export const DURATION = { fast: 0.15, base: 0.22, slow: 0.3 } as const;

export const EASE = {
  out: [0.22, 1, 0.36, 1] as [number, number, number, number],
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
};

export const SPRING = {
  sheet: { type: "spring", stiffness: 420, damping: 38 },
  pill: { type: "spring", stiffness: 500, damping: 40 },
} as const satisfies Record<string, Transition>;

/** Page content variants for a direction: 1 = forward (rises from below), -1 = back (drops in from above). */
export function pageVariantsFor(dir: 1 | -1): Variants {
  return {
    initial: { opacity: 0, y: 8 * dir },
    animate: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE.out } },
    exit: { opacity: 0, y: -4 * dir, transition: { duration: DURATION.fast, ease: EASE.out } },
  };
}

/** Page content: fades and rises ~8px (forward navigation). */
export const pageVariants: Variants = pageVariantsFor(1);

/** Parent of a staggered list; only the first ~10 children are noticeably staggered. */
export const listContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.03, delayChildren: 0.02 } },
};

export const listItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE.out } },
  exit: { opacity: 0, transition: { duration: DURATION.fast } },
};

/** Dialog (desktop): scales in from 96%. */
export const dialogVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: DURATION.base, ease: EASE.out } },
  exit: { opacity: 0, scale: 0.96, transition: { duration: DURATION.fast } },
};

/** Bottom sheet (phone): slides up with a spring. */
export const sheetVariants: Variants = {
  hidden: { y: "100%" },
  show: { y: 0, transition: SPRING.sheet },
  exit: { y: "100%", transition: { duration: DURATION.base, ease: EASE.inOut } },
};

export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DURATION.fast } },
  exit: { opacity: 0, transition: { duration: DURATION.fast } },
};

/**
 * True when the user asked the OS for reduced motion. False during SSR. Components use it to
 * render without animation (and to skip exit animations so nothing lingers).
 */
export function useReducedMotionSafe(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY, false);
}

/**
 * Animates a number from its previous value to `target` (≤ 300ms, ease-out). With reduced
 * motion it returns the target immediately.
 */
export function useCountUp(target: number, durationMs = DURATION.slow * 1000): number {
  const reduced = useReducedMotionSafe();
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    if (reduced || typeof requestAnimationFrame === "undefined") {
      fromRef.current = target;
      setValue(target);
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, reduced, durationMs]);

  return value;
}
