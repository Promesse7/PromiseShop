import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  title: string;
  /** One sentence on what to do next. */
  message?: string;
  icon?: LucideIcon;
  /** Usually the page's primary action, e.g. "+ New product". */
  action?: ReactNode;
}

/** What a list or page shows when there is nothing in it yet (or nothing matches the filters). */
export function EmptyState({ title, message, icon: Icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-divider px-6 py-10 text-center">
      {Icon && (
        <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      )}
      <p className="m-0 font-medium">{title}</p>
      {message && <p className="m-0 max-w-sm text-sm text-text/60">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
