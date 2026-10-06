"use client";

import { useSyncExternalStore } from "react";
import { useIsDesktop } from "@/lib/useMediaQuery";
import { useReducedMotionSafe } from "@/lib/motion";
import { useScrollDirection } from "./useScrollDirection";

/** Height of the phone TabBar (without the safe-area inset). */
export const TAB_BAR_HEIGHT = 64;

function subscribeBodyStyle(onChange: () => void): () => void {
  if (typeof MutationObserver === "undefined") return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, { attributes: true, attributeFilter: ["style"] });
  return () => observer.disconnect();
}

/** True while a Dialog/sheet has locked the page scroll (Dialog sets body overflow hidden). */
function useScrollLocked(): boolean {
  return useSyncExternalStore(
    subscribeBodyStyle,
    () => document.body.style.overflow === "hidden",
    () => false
  );
}

/**
 * Whether the phone's bottom chrome (TabBar and the sticky action bars that sit on it) should
 * slide away. True only while the user is scrolling down on a phone; never on desktop, never
 * with reduced motion, and never while a dialog is open.
 */
export function useBottomChromeHidden(): boolean {
  const direction = useScrollDirection();
  const desktop = useIsDesktop();
  const reduced = useReducedMotionSafe();
  const locked = useScrollLocked();
  return !desktop && !reduced && !locked && direction === "down";
}

/**
 * How far above the viewport bottom a sticky bottom bar should sit: on top of the TabBar while
 * it shows, at the edge while it is hidden. 0 on desktop (no TabBar). Callers add the
 * safe-area inset themselves.
 */
export function useStickyBottomOffset(): number {
  const desktop = useIsDesktop();
  const hidden = useBottomChromeHidden();
  if (desktop) return 0;
  return hidden ? 0 : TAB_BAR_HEIGHT;
}
