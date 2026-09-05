"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { CardKicker } from "@/components/ui/Card";
import { useWorkflowHints } from "@/lib/guidance/useWorkflowHints";

const STORAGE_KEY = "promiseshop.guidance.dismissed";
const EMPTY = "{}";

type Dismissed = Record<string, string>;

// localStorage exposed as an external store, so the bar reads dismissals without
// a state-syncing effect and hydrates with the server's empty snapshot first.
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

function getServerSnapshot(): string {
  return EMPTY;
}

function parseDismissed(raw: string): Dismissed {
  try {
    return JSON.parse(raw) as Dismissed;
  } catch {
    return {};
  }
}

function writeDismissed(value: Dismissed) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode, quota): dismissals simply don't persist.
  }
  listeners.forEach((listener) => listener());
}

// Mounted once in the protected layout: first-run setup steps until the first
// purchase is received, then whatever has been left half-done. Setup steps can't
// be dismissed; to-dos can, and come back when their count changes.
export function GuidanceBar() {
  const { hints, isLoading } = useWorkflowHints();
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const dismissed = useMemo(() => parseDismissed(raw), [raw]);

  if (isLoading) return null;

  const setup = hints.filter((h) => h.kind === "setup");
  const todos = hints.filter((h) => h.kind === "todo" && dismissed[h.key] !== h.signature);
  if (setup.length === 0 && todos.length === 0) return null;

  function dismiss(key: string, signature: string) {
    writeDismissed({ ...dismissed, [key]: signature });
  }

  return (
    <aside aria-label="Next steps" className="max-w-[1400px] mx-auto px-4 md:px-6 pt-4">
      <div className="glass rounded-md px-4 py-3">
        {setup.length > 0 ? (
          <>
            <CardKicker>Let&apos;s get your shop set up</CardKicker>
            <ul className="mt-1 flex flex-wrap gap-x-6 gap-y-1 list-none p-0 m-0">
              {setup.map((hint) => (
                <li key={hint.key} className="flex items-center gap-2 text-sm">
                  <span className={hint.done ? "text-accent" : "text-text/30"} aria-hidden>
                    {hint.done ? "✓" : "○"}
                  </span>
                  {hint.done ? (
                    <span className="text-text/50">{hint.label}</span>
                  ) : (
                    <Link href={hint.href} className="text-accent">
                      {hint.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <CardKicker>Next steps</CardKicker>
            <ul className="mt-1 flex flex-wrap gap-x-6 gap-y-1 list-none p-0 m-0">
              {todos.map((hint) => (
                <li key={hint.key} className="flex items-center gap-2 text-sm">
                  <span className="text-amber-500" aria-hidden>
                    ●
                  </span>
                  <Link href={hint.href} className="text-accent">
                    {hint.label}
                  </Link>
                  <button
                    type="button"
                    aria-label={`Dismiss: ${hint.label}`}
                    onClick={() => dismiss(hint.key, hint.signature)}
                    className="text-text/40 hover:text-text text-xs leading-none px-1"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
