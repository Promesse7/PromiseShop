"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const STORAGE_KEY = "promiseshop.guidance.dismissed";
const EMPTY = "{}";

export type DismissedHints = Record<string, string>;

// localStorage as an external store, so readers need no state-syncing effect and hydrate
// with the server's empty snapshot first. Same key the old GuidanceBar used, so earlier
// dismissals carry over.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}

function parse(raw: string): DismissedHints {
  try {
    return JSON.parse(raw) as DismissedHints;
  } catch {
    return {};
  }
}

/** Dismissed to-do hints ({key: signature}); a hint comes back when its signature changes. */
export function useDismissedHints(): [DismissedHints, (key: string, signature: string) => void] {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const dismissed = useMemo(() => parse(raw), [raw]);
  const dismiss = useCallback((key: string, signature: string) => {
    const next = { ...parse(getSnapshot()), [key]: signature };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable: the dismissal just doesn't persist.
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [dismissed, dismiss];
}
