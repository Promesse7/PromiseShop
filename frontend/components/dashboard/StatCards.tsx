import { Wallet, ShoppingBag, TrendingUp, TrendingDown, AlertTriangle, type LucideIcon } from "lucide-react";
import { Card, CardKicker, CardMeta } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { formatRwf } from "@/lib/format";
import { useCountUp } from "@/lib/motion";
import type { DashboardData } from "@/lib/dashboard/useDashboardData";

interface StatCardsProps {
  data: DashboardData;
}

/** A money figure that counts up to its value (instant with reduced motion). */
function CountUpRwf({ value, className = "" }: { value: number; className?: string }) {
  const shown = useCountUp(value);
  return <span className={`font-sans text-xl font-medium tabular-nums sm:text-2xl ${className}`}>{formatRwf(shown)}</span>;
}

function CountUpNumber({ value }: { value: number }) {
  return <>{Math.round(useCountUp(value))}</>;
}

function monthOverMonthDelta(values: number[]): number | null {
  if (values.length < 2) return null;
  const prev = values[values.length - 2];
  const curr = values[values.length - 1];
  if (prev === 0) return null;
  return (curr - prev) / prev;
}

function sparklinePoints(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(" ");
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  return (
    <svg width={64} height={22} viewBox="0 0 64 22" className="text-accent/70" aria-hidden>
      <polyline points={sparklinePoints(values, 64, 22)} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

function TrendBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const isUp = delta >= 0;
  const Icon = isUp ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${isUp ? "text-emerald-600" : "text-red-600"}`}
    >
      <Icon className="w-3 h-3" aria-hidden />
      {Math.abs(delta * 100).toFixed(1)}%
    </span>
  );
}

function CardIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="ml-auto flex items-center justify-center w-8 h-8 rounded-md bg-accent/10 text-accent">
      <Icon className="w-4 h-4" aria-hidden />
    </span>
  );
}

export function StatCards({ data }: StatCardsProps) {
  const revenueTrend = data.trend.map((t) => t.revenue);
  const costTrend = data.trend.map((t) => t.purchaseCost);
  const profitTrend = data.trend.map((t) => t.revenue - t.purchaseCost);

  return (
    <ul aria-label="Key figures" className="m-0 grid list-none grid-cols-2 gap-3 p-0 lg:grid-cols-4 lg:gap-4">
      <li>
        <Card variant="glass" className="h-full">
          <div className="flex items-start">
            <CardKicker>Sales revenue</CardKicker>
            <CardIcon icon={Wallet} />
          </div>
          <CountUpRwf value={data.salesRevenue} />
          <div className="flex items-center gap-2">
            <Sparkline values={revenueTrend} />
            <TrendBadge delta={monthOverMonthDelta(revenueTrend)} />
          </div>
          <CardMeta>{data.saleCount} sales this month</CardMeta>
        </Card>
      </li>
      <li>
        <Card variant="glass" className="h-full">
          <div className="flex items-start">
            <CardKicker>Purchase cost</CardKicker>
            <CardIcon icon={ShoppingBag} />
          </div>
          <CountUpRwf value={data.purchaseCost} />
          <div className="flex items-center gap-2">
            <Sparkline values={costTrend} />
            <TrendBadge delta={monthOverMonthDelta(costTrend)} />
          </div>
          <CardMeta>{data.purchaseOrderCount} purchase orders (paid amounts)</CardMeta>
        </Card>
      </li>
      <li>
        <Card variant="glass" className="h-full">
          <div className="flex items-start">
            <CardKicker>Gross profit</CardKicker>
            <CardIcon icon={TrendingUp} />
          </div>
          <CountUpRwf value={data.grossProfit} className="text-accent" />
          <div className="flex items-center gap-2">
            <Sparkline values={profitTrend} />
            <TrendBadge delta={monthOverMonthDelta(profitTrend)} />
          </div>
          <CardMeta>revenue − purchase cost · {(data.grossMarginPct * 100).toFixed(1)}% margin</CardMeta>
        </Card>
      </li>
      <li>
        <Card variant="glass" className="h-full">
          <div className="flex items-start">
            <CardKicker>Needs reorder</CardKicker>
            <CardIcon icon={AlertTriangle} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-sans text-xl font-medium sm:text-2xl">
              <CountUpNumber value={data.reorderCount} /> products
            </span>
            {data.reorderCount > 0 && <Tag variant="warning">Reorder</Tag>}
          </div>
          <CardMeta>{data.outOfStockCount} out of stock</CardMeta>
        </Card>
      </li>
    </ul>
  );
}
