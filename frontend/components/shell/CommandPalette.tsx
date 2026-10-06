"use client";

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Search } from "lucide-react";
import { useCommandResults } from "@/lib/nav/useCommandResults";
import type { CommandResult } from "@/lib/nav/commandResults";
import { backdropVariants, DURATION, EASE, useReducedMotionSafe } from "@/lib/motion";
import { useIsDesktop } from "@/lib/useMediaQuery";
import type { EmployeeRole } from "@/lib/types";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  role: EmployeeRole;
}

/** Ctrl/Cmd+K, or "/" when not typing in a field. Pass a stable callback (useCallback). */
export function useCommandPaletteShortcut(onOpen: () => void): void {
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target !== null &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpen();
      } else if (event.key === "/" && !typing) {
        event.preventDefault();
        onOpen();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpen]);
}

function PaletteBody({ onClose, role }: { onClose: () => void; role: EmployeeRole }) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const { results, isSearching } = useCommandResults(query, role, true);
  const index = Math.min(activeIndex, Math.max(results.length - 1, 0));

  function go(result: CommandResult | undefined) {
    if (!result) return;
    onClose();
    router.push(result.href);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index + 1) % Math.max(results.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index - 1 + results.length) % Math.max(results.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[index]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-divider px-4 py-3">
        {isSearching ? (
          <Loader2 className="w-4 h-4 animate-spin text-text/40" aria-hidden />
        ) : (
          <Search className="w-4 h-4 text-text/40" aria-hidden />
        )}
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={results[index] ? `${listId}-${index}` : undefined}
          aria-label="Search or jump to"
          placeholder="Search pages, products, customers, sale #…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
          className="flex-1 bg-transparent text-base outline-none"
        />
        <button type="button" onClick={onClose} className="text-xs text-text/50 hover:text-text">
          Esc
        </button>
      </div>
      <ul id={listId} role="listbox" aria-label="Results" className="list-none m-0 p-2 overflow-y-auto flex-1 lg:max-h-[60vh]">
        {results.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-text/50">{isSearching ? "Searching…" : "No matches"}</li>
        )}
        {results.map((result, i) => {
          const header = i === 0 || results[i - 1].section !== result.section ? result.section : null;
          const Icon = result.icon;
          return (
            <li key={result.id} role="presentation">
              {header && (
                <p className="m-0 px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-text/45" aria-hidden>
                  {header}
                </p>
              )}
              <div
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === index}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => go(result)}
                className={[
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm cursor-pointer",
                  i === index ? "bg-accent/10 text-accent" : "text-text",
                ].join(" ")}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden />
                <span className="flex-1 truncate">{result.label}</span>
                {result.hint && <span className="text-xs text-text/45 truncate">{result.hint}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Jump search: pages, quick actions, products, customers and sale numbers. */
export function CommandPalette({ open, onClose, role }: CommandPaletteProps) {
  const reduced = useReducedMotionSafe();
  const desktop = useIsDesktop();

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 print:hidden">
          <motion.div
            className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm"
            variants={backdropVariants}
            initial={reduced ? false : "hidden"}
            animate="show"
            exit={reduced ? undefined : "exit"}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Jump search"
            initial={reduced ? false : desktop ? { opacity: 0, y: -12, scale: 0.98 } : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? undefined : desktop ? { opacity: 0, y: -8, scale: 0.98 } : { opacity: 0, y: 24 }}
            transition={{ duration: DURATION.base, ease: EASE.out }}
            className={
              desktop
                ? "relative mx-auto mt-[12vh] w-full max-w-xl rounded-lg bg-surface shadow-lg flex flex-col overflow-hidden"
                : "absolute inset-0 bg-surface flex flex-col pt-[env(safe-area-inset-top)]"
            }
          >
            <PaletteBody onClose={onClose} role={role} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
