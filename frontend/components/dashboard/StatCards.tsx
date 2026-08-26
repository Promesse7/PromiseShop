import { Card, CardKicker, CardMeta } from "@/components/ui/Card";
import type { DashboardData } from "@/lib/dashboard/useDashboardData";

interface StatCardsProps {
  data: DashboardData;
}

function formatRwf(value: number): string {
  return `RWF ${Math.round(value).toLocaleString()}`;
}

export function StatCards({ data }: StatCardsProps) {
  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      <Card variant="glass">
        <CardKicker>Sales revenue</CardKicker>
        <span className="font-sans font-medium text-2xl">{formatRwf(data.salesRevenue)}</span>
        <CardMeta>{data.saleCount} sales this month</CardMeta>
      </Card>
      <Card variant="glass">
        <CardKicker>Purchase cost</CardKicker>
        <span className="font-sans font-medium text-2xl">{formatRwf(data.purchaseCost)}</span>
        <CardMeta>{data.purchaseOrderCount} purchase orders (paid amounts)</CardMeta>
      </Card>
      <Card variant="glass">
        <CardKicker>Gross profit</CardKicker>
        <span className="font-sans font-medium text-2xl text-accent-300">{formatRwf(data.grossProfit)}</span>
        <CardMeta>revenue − purchase cost · {(data.grossMarginPct * 100).toFixed(1)}% margin</CardMeta>
      </Card>
      <Card variant="glass">
        <CardKicker>Needs reorder</CardKicker>
        <span className="font-sans font-medium text-2xl">{data.reorderCount} products</span>
        <CardMeta>{data.outOfStockCount} out of stock</CardMeta>
      </Card>
    </div>
  );
}
