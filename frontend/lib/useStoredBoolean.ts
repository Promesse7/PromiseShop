"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * A boolean kept in localStorage (per device). Read through useSyncExternalStore so it
 * hydrates with `fallback` and needs no state-syncing effect; storage errors (private mode,
 * blocked site data) just mean the choice isn't remembered.
 */
export function useStoredBoolean(key: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const raw = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => read(key),
    () => null
  );
  const value = raw === null ? fallback : raw === "true";
  const set = useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, String(next));
      } catch {
        // Not persisted.
      }
      listeners.forEach((listener) => listener());
    },
    [key]
  );
  return [value, set];
}
