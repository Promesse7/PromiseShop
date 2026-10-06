"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { useWorkflowHints } from "@/lib/guidance/useWorkflowHints";
import { useDismissedHints } from "@/lib/guidance/dismissedHints";
import { tipsForPath } from "@/lib/guidance/pageTips";
import type { WorkflowHint } from "@/lib/guidance/workflowHints";

/** To-dos still open (setup steps always count until done; to-dos until dismissed). */
export function useOpenHints(): { setup: WorkflowHint[]; todos: WorkflowHint[]; count: number } {
  const { hints } = useWorkflowHints();
  const [dismissed] = useDismissedHints();
  const setup = hints.filter((h) => h.kind === "setup");
  const todos = hints.filter((h) => h.kind === "todo" && dismissed[h.key] !== h.signature);
  return { setup, todos, count: setup.filter((h) => !h.done).length + todos.length };
}

export function HelpButton({ onClick }: { onClick: () => void }) {
  const { count } = useOpenHints();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count > 0 ? `Help, ${count} to-do${count === 1 ? "" : "s"}` : "Help"}
      className="relative flex h-9 w-9 items-center justify-center rounded-md text-text/70 hover:text-text hover:bg-text/[0.05]"
    >
      <CircleHelp className="w-[18px] h-[18px]" aria-hidden />
      {count > 0 && (
        <span data-testid="help-dot" className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-500" aria-hidden />
      )}
    </button>
  );
}

interface HelpPanelProps {
  open: boolean;
  onClose: () => void;
}

/** What's left to do, and how the current page works. Replaces the old always-on guidance bar. */
export function HelpPanel({ open, onClose }: HelpPanelProps) {
  const pathname = usePathname() ?? "/";
  const { setup, todos } = useOpenHints();
  const [, dismiss] = useDismissedHints();
  const page = tipsForPath(pathname);
  const setupLeft = setup.some((h) => !h.done);

  return (
    <Dialog open={open} onClose={onClose} title="Help" size="md">
      <div className="flex flex-col gap-4 text-sm">
        {setupLeft && (
          <section>
            <h5 className="m-0 mb-1">Set up your shop</h5>
            <ul className="list-none m-0 p-0 flex flex-col gap-1">
              {setup.map((hint) => (
                <li key={hint.key} className="flex items-center gap-2">
                  <span className={hint.done ? "text-accent" : "text-text/30"} aria-hidden>
                    {hint.done ? "✓" : "○"}
                  </span>
                  {hint.done ? (
                    <span className="text-text/50">{hint.label}</span>
                  ) : (
                    <Link href={hint.href} onClick={onClose} className="text-accent">
                      {hint.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h5 className="m-0 mb-1">Next steps</h5>
          {todos.length === 0 ? (
            <p className="m-0 text-text/50">Nothing waiting. Everything is up to date.</p>
          ) : (
            <ul className="list-none m-0 p-0 flex flex-col gap-1">
              {todos.map((hint) => (
                <li key={hint.key} className="flex items-center gap-2">
                  <span className="text-amber-500" aria-hidden>
                    ●
                  </span>
                  <Link href={hint.href} onClick={onClose} className="text-accent flex-1">
                    {hint.label}
                  </Link>
                  <button
                    type="button"
                    aria-label={`Dismiss: ${hint.label}`}
                    onClick={() => dismiss(hint.key, hint.signature)}
                    className="text-text/40 hover:text-text text-xs px-1"
                  >
                    Dismiss
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {page && (
          <section>
            <h5 className="m-0 mb-1">About {page.title}</h5>
            <ul className="m-0 pl-5 flex flex-col gap-1 text-text/75">
              {page.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Dialog>
  );
}
