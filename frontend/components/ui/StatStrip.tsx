"use client";

import type { ReactNode } from "react";
import { formatRwf } from "@/lib/format";
import { useCountUp } from "@/lib/motion";
import { useIsDesktop } from "@/lib/useMediaQuery";
import { ScrollArea } from "./ScrollArea";

export interface Stat {
  label: string;
  /** Money: shown as "RWF 1,234" and counted up when it changes. */
  amount?: string | number | null;
  /** Anything else (a status tag, a count, a date). Ignored when `amount` is set. */
  value?: ReactNode;
  tone?: "default" | "danger" | "success" | "muted";
  hint?: string;
}

const TONE_CLASS: Record<NonNullable<Stat["tone"]>, string> = {
  default: "text-text",
  danger: "text-red-500",
  success: "text-emerald-600",
  muted: "text-text/60",
};

function Amount({ amount, tone }: { amount: string | number | null; tone: NonNullable<Stat["tone"]> }) {
  const target = amount === null || amount === "" ? NaN : Number(amount);
  const shown = useCountUp(Number.isFinite(target) ? target : 0);
  return (
    <span data-tone={tone} className={`tabular-nums ${TONE_CLASS[tone]}`}>
      {Number.isFinite(target) ? formatRwf(shown) : "—"}
    </span>
  );
}

/**
 * A row of headline figures above a screen's detail: totals, balances, a status. On phone
 * it becomes a sideways row that snaps figure by figure, with the next one peeking in.
 */
export function StatStrip({ stats, label }: { stats: Stat[]; label?: string }) {
  const isDesktop = useIsDesktop();
  const list = (
    <ul
      aria-label={label}
      className={
        isDesktop
          ? "m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]"
          : "m-0 flex list-none gap-2 p-0"
      }
    >
      {stats.map((stat) => {
        const tone = stat.tone ?? "default";
        return (
          <li
            key={stat.label}
            className={`rounded-lg border border-divider bg-surface px-3.5 py-3 shadow-sm ${
              isDesktop ? "" : "w-[80%] shrink-0 snap-start"
            }`}
          >
            <div>
              <div className="text-xs text-text/55">{stat.label}</div>
              <div className="mt-0.5 font-sans text-lg font-medium leading-tight">
                {stat.amount !== undefined ? (
                  <Amount amount={stat.amount} tone={tone} />
                ) : (
                  <span data-tone={tone} className={TONE_CLASS[tone]}>
                    {stat.value}
                  </span>
                )}
              </div>
              {stat.hint && <div className="mt-0.5 text-xs text-text/50">{stat.hint}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
  if (isDesktop) return list;
  return (
    <ScrollArea orientation="horizontal" className="snap-x snap-mandatory pb-1">
      {list}
    </ScrollArea>
  );
}
