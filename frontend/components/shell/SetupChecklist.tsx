"use client";

import Link from "next/link";
import { CardKicker } from "@/components/ui/Card";
import { useWorkflowHints } from "@/lib/guidance/useWorkflowHints";

/** First-run setup steps on the Dashboard, until the first purchase has been received. */
export function SetupChecklist() {
  const { hints, isLoading } = useWorkflowHints();
  const setup = hints.filter((h) => h.kind === "setup");
  if (isLoading || setup.length === 0) return null;

  return (
    <aside aria-label="Set up your shop" className="glass rounded-md px-4 py-3 mb-4">
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
    </aside>
  );
}
