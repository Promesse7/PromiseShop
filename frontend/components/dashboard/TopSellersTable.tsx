import { Card, CardKicker } from "@/components/ui/Card";
import type { TopSellerRow } from "@/lib/dashboard/useDashboardData";

interface TopSellersTableProps {
  rows: TopSellerRow[];
}

const RANK_BADGE_CLASS: Record<number, string> = {
  0: "bg-amber-400 text-amber-950",
  1: "bg-neutral-300 text-neutral-800",
  2: "bg-amber-700 text-amber-50",
};

export function TopSellersTable({ rows }: TopSellersTableProps) {
  const maxRevenue = Math.max(1, ...rows.map((r) => r.revenue));

  return (
    <Card elevation="sm">
      <CardKicker>Top sellers — this month</CardKicker>
      {rows.length === 0 ? (
        <p className="text-sm text-text/50">No sales yet this month</p>
      ) : (
        <ul className="flex flex-col gap-3 list-none m-0 p-0">
          {rows.map((row, i) => (
            <li key={row.product_id} className="flex items-center gap-3">
              <span
                className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold shrink-0 ${
                  RANK_BADGE_CLASS[i] ?? "bg-neutral-100 text-neutral-600"
                }`}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm truncate">{row.product_name}</span>
                  <span className="text-sm font-medium whitespace-nowrap">{row.revenue.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 rounded-full bg-neutral-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${(row.revenue / maxRevenue) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-text/50 whitespace-nowrap">
                    <span>{row.units}</span> units
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
