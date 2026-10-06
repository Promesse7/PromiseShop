"use client";

import type { CartLine } from "@/lib/pos/cart";
import type { PriceCheckLine } from "@/lib/types";

interface PriceDifferenceProps {
  line: CartLine;
  // The server's verdict for this line (see usePriceCheck); absent until it arrives.
  verdict?: PriceCheckLine;
}

/**
 * Catalog price, the difference in RWF and %, coloured: green for a markup,
 * amber for a discount within the cashier's limit, red when it needs a manager.
 * Never shows cost — the floor is only ever reported as a rule by the server.
 */
export function PriceDifference({ line, verdict }: PriceDifferenceProps) {
  const list = line.product.retail_price;
  if (line.unitPrice === list || list <= 0) return null;

  const diff = (line.unitPrice - list) * line.quantity;
  const pct = ((line.unitPrice - list) / list) * 100;
  const needsManager = verdict?.needs_approval ?? false;
  const colour = diff > 0 ? "text-green-500" : needsManager ? "text-red-400" : "text-amber-500";
  const sign = diff > 0 ? "+" : "−";

  let message: string | null = null;
  if (verdict?.rule === "below_floor") {
    message = verdict.needs_approval
      ? "Below the minimum price — needs manager approval and a note"
      : "Below the minimum price — add a note";
  } else if (needsManager) {
    message = "Needs manager approval";
  }

  return (
    <div className="text-xs mt-0.5">
      <span className="text-text/50">list {list.toLocaleString()}</span>{" "}
      <span className={colour}>
        {sign}RWF {Math.abs(diff).toLocaleString()} ({sign}
        {Math.abs(pct).toFixed(1)}%)
      </span>
      {message && <div className="text-red-400">{message}</div>}
    </div>
  );
}
