"use client";

import type { CSSProperties } from "react";
import { useStickyBottomOffset } from "@/lib/scroll/chrome";

/** Classes for a phone bottom bar that rides on the tab bar: glides when the tab bar hides. */
export const STICKY_BOTTOM_TRANSITION = "transition-[bottom] duration-200 ease-out motion-reduce:transition-none";

/**
 * Inline `bottom` for a fixed phone action bar (checkout total, purchase summary, bulk bar):
 * on top of the tab bar while it shows, at the screen edge while it has slid away.
 */
export function useStickyBottomStyle(): CSSProperties {
  const offset = useStickyBottomOffset();
  return { bottom: `calc(${offset}px + env(safe-area-inset-bottom))` };
}
