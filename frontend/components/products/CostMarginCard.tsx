import Link from "next/link";
import { Card, CardKicker } from "@/components/ui/Card";
import type { ProfitabilityRow } from "@/lib/types";

interface CostMarginCardProps {
  row: ProfitabilityRow | undefined;
  isLoading: boolean;
  isError: boolean;
  /** When given, links to the per-period money drill-down (Module H2). */
  productId?: number;
}

function rwf(value: string | number): string {
  return `RWF ${Number(value).toLocaleString()}`;
}

function marginLabel(amount: string | null, pct: string | null): string {
  if (amount == null || pct == null) return "—";
  return `${rwf(amount)} · ${Number(pct).toFixed(1)}%`;
}

export function CostMarginCard({ row, isLoading, isError, productId }: CostMarginCardProps) {
  let body;
  if (isLoading) {
    body = <p className="text-sm text-text/50">Loading cost &amp; margin…</p>;
  } else if (isError) {
    body = <p className="text-sm text-red-400">Couldn&apos;t load cost &amp; margin.</p>;
  } else if (!row || row.avg_cost_paid == null) {
    body = (
      <>
        <p className="text-sm text-text/50">No received purchase yet — costs unknown</p>
        {row && (
          <div className="flex justify-between text-sm">
            <span>Units</span>
            <span>{row.units_bought} bought · {row.units_sold} sold</span>
          </div>
        )}
      </>
    );
  } else {
    const avgSellingPrice = row.units_sold > 0 ? Number(row.revenue) / row.units_sold : null;
    body = (
      <>
        <div className="flex justify-between text-sm">
          <span>Avg cost paid</span>
          <span>{rwf(row.avg_cost_paid)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Avg cost invoiced</span>
          <span>{row.avg_cost_invoiced != null ? rwf(row.avg_cost_invoiced) : "—"}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Units</span>
          <span>{row.units_bought} bought · {row.units_sold} sold</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Avg selling price</span>
          <span>{avgSellingPrice != null ? rwf(avgSellingPrice) : "—"}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Actual margin</span>
          <span className="text-accent-300">{marginLabel(row.gross_margin, row.margin_pct)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Projected margin</span>
          <span>{marginLabel(row.projected_margin, row.projected_margin_pct)}</span>
        </div>
        <p className="text-xs text-text/50 mt-1">
          Actual = sold price − paid cost. Projected = catalog price − invoiced cost.
        </p>
      </>
    );
  }

  return (
    <Card elevation="sm">
      <CardKicker>Cost &amp; margin · all time</CardKicker>
      {body}
      {productId != null && (
        <Link href={`/dashboard/products/${productId}`} className="text-xs text-accent mt-1 self-start">
          Money drill-down by period →
        </Link>
      )}
    </Card>
  );
}
