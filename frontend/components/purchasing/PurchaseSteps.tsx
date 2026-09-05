import type { Purchase } from "@/lib/types";

const STEPS = ["Add items", "Check totals", "Receive"];

interface PurchaseStepsProps {
  itemCount: number;
  status: Purchase["status"];
}

function messageFor(status: Purchase["status"], itemCount: number): string {
  if (status === "received") return "Received — stock has been updated.";
  if (status === "cancelled") return "Cancelled — nothing was added to stock.";
  if (itemCount === 0) return "Add at least one item, then check the totals and receive.";
  return "Check the paid and invoiced totals, then receive to add the items to stock.";
}

// Where a purchase is in its life: a draft with no items sits on step 1, a draft
// with items on step 2, and receiving completes step 3.
export function PurchaseSteps({ itemCount, status }: PurchaseStepsProps) {
  const current = status === "received" ? STEPS.length : status === "cancelled" ? -1 : itemCount === 0 ? 0 : 1;

  return (
    <div className="mb-4">
      <ol className="flex flex-wrap items-center gap-2 list-none p-0 m-0 text-xs">
        {STEPS.map((label, i) => {
          const done = i < current;
          const isCurrent = i === current;
          return (
            <li
              key={label}
              aria-current={isCurrent ? "step" : undefined}
              className={[
                "flex items-center gap-1.5 rounded-sm px-2 py-1",
                isCurrent ? "bg-accent/10 text-accent" : done ? "text-text/60" : "text-text/40",
              ].join(" ")}
            >
              <span
                className={[
                  "inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px]",
                  done ? "bg-accent text-white" : isCurrent ? "border border-accent" : "border border-divider",
                ].join(" ")}
                aria-hidden
              >
                {done ? "✓" : i + 1}
              </span>
              {label}
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-text/50 mt-1">{messageFor(status, itemCount)}</p>
    </div>
  );
}
