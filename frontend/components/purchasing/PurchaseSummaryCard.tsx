"use client";

import { Card, CardKicker } from "@/components/ui/Card";
import type { Purchase } from "@/lib/types";

interface PurchaseSummaryCardProps {
  purchase: Purchase;
}

function formatMoney(value?: string): string | null {
  if (value == null) return null;
  return `RWF ${Number(value).toLocaleString()}`;
}

export function PurchaseSummaryCard({ purchase }: PurchaseSummaryCardProps) {
  const paid = formatMoney(purchase.total_paid);
  const invoiced = formatMoney(purchase.total_invoiced);
  const difference =
    purchase.total_paid != null && purchase.total_invoiced != null
      ? Number(purchase.total_invoiced) - Number(purchase.total_paid)
      : null;

  return (
    <Card elevation="sm">
      <CardKicker>On this purchase</CardKicker>
      <div className="flex justify-between text-sm">
        <span>Total paid</span>
        <span className="font-sans">{paid ?? "—"}</span>
      </div>
      {invoiced != null && (
        <div className="flex justify-between text-sm">
          <span>Total invoiced</span>
          <span>{invoiced}</span>
        </div>
      )}
      {difference != null && difference !== 0 && (
        <div className="flex justify-between text-sm text-accent-300">
          <span>Difference</span>
          <span>RWF {Math.abs(difference).toLocaleString()} · profit uses paid</span>
        </div>
      )}
    </Card>
  );
}
