"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { motion } from "motion/react";
import { SPRING, useReducedMotionSafe } from "@/lib/motion";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  /** Renders the active panel. Omit it to use Tabs as a bare switcher. */
  children?: (active: string) => ReactNode;
}

/** The sticky top bar's height: a tab row brought back into view sits just under it. */
const TOP_BAR_OFFSET = 56;
/** Breathing room when sliding a tab into a crowded row. */
const STRIP_PADDING = 8;

export function Tabs({ tabs, value, onChange, label, children }: TabsProps) {
  const id = useId();
  const reduced = useReducedMotionSafe();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const tablist = useRef<HTMLDivElement>(null);
  // Where the page was scrolled to in each tab, so coming back lands where you left off.
  const positions = useRef(new Map<string, number>());
  const switching = useRef(false);
  const activeIndex = Math.max(0, tabs.findIndex((t) => t.id === value));

  function select(next: string) {
    if (next === value) return;
    positions.current.set(value, window.scrollY);
    switching.current = true;
    onChange(next);
  }

  useEffect(() => {
    // Only when the person switched tabs here; never on first render or outside changes.
    if (!switching.current) return;
    switching.current = false;
    const behavior: ScrollBehavior = reduced ? "auto" : "smooth";

    const row = tablist.current;
    if (row) {
      const rowTop = row.getBoundingClientRect().top + window.scrollY - TOP_BAR_OFFSET;
      const saved = positions.current.get(value);
      if (saved !== undefined && saved >= rowTop) {
        window.scrollTo({ top: saved, behavior });
      } else if (window.scrollY > rowTop) {
        window.scrollTo({ top: rowTop, behavior });
      }
    }

    // Slide the chosen tab into view inside its own row: sideways only, the page stays put.
    const button = buttons.current[activeIndex];
    const strip = button?.parentElement?.closest<HTMLElement>("[data-at-start]") ?? button?.parentElement;
    if (button && strip && typeof strip.scrollTo === "function") {
      const left = button.offsetLeft;
      const right = left + button.offsetWidth;
      if (right > strip.scrollLeft + strip.clientWidth) {
        strip.scrollTo({ left: right - strip.clientWidth + STRIP_PADDING, behavior });
      } else if (left < strip.scrollLeft) {
        strip.scrollTo({ left: Math.max(0, left - STRIP_PADDING), behavior });
      }
    }
  }, [value, activeIndex, reduced]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const jump = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
    if (!step && jump === null) return;
    event.preventDefault();
    const next = jump ?? (activeIndex + step + tabs.length) % tabs.length;
    select(tabs[next].id);
    buttons.current[next]?.focus();
  }

  return (
    <div>
      <div
        ref={tablist}
        role="tablist"
        aria-label={label}
        onKeyDown={handleKeyDown}
        className="flex gap-1 border-b border-divider overflow-x-auto"
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === value;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                buttons.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(tab.id)}
              className={`relative whitespace-nowrap px-3 py-2 text-sm transition-colors ${
                selected ? "text-accent font-medium" : "text-text/60 hover:text-text"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1.5 rounded-full bg-neutral-200 px-1.5 text-xs text-text/70">{tab.count}</span>
              )}
              {selected && (
                <motion.span
                  layoutId={reduced ? undefined : `${id}-underline`}
                  transition={SPRING.pill}
                  className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-accent"
                />
              )}
            </button>
          );
        })}
      </div>
      {children && (
        <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${value}`} className="pt-4">
          {children(value)}
        </div>
      )}
    </div>
  );
}
