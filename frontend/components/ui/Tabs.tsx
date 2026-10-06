"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
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

export function Tabs({ tabs, value, onChange, label, children }: TabsProps) {
  const id = useId();
  const reduced = useReducedMotionSafe();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = Math.max(0, tabs.findIndex((t) => t.id === value));

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const jump = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
    if (!step && jump === null) return;
    event.preventDefault();
    const next = jump ?? (activeIndex + step + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    buttons.current[next]?.focus();
  }

  return (
    <div>
      <div
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
              onClick={() => onChange(tab.id)}
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
