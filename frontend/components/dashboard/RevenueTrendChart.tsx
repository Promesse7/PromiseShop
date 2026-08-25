import { Card, CardKicker } from "@/components/ui/Card";
import type { MonthlyTrendPoint } from "@/lib/dashboard/useDashboardData";

interface RevenueTrendChartProps {
  points: MonthlyTrendPoint[];
}

const WIDTH = 640;
const HEIGHT = 220;
const BASELINE = 190;
const TOP = 20;
const BAR_WIDTH = 16;

export function RevenueTrendChart({ points }: RevenueTrendChartProps) {
  const max = Math.max(1, ...points.flatMap((p) => [p.revenue, p.purchaseCost]));
  const slotWidth = points.length > 0 ? WIDTH / points.length : WIDTH;

  return (
    <Card elevation="sm">
      <CardKicker>Revenue vs purchase cost — {points.length} months</CardKicker>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label="Revenue vs purchase cost, trailing months"
      >
        <line x1={0} y1={BASELINE} x2={WIDTH} y2={BASELINE} stroke="#3f424d" />
        {points.map((point, i) => {
          const slotX = i * slotWidth + slotWidth / 2 - BAR_WIDTH;
          const revenueHeight = (point.revenue / max) * (BASELINE - TOP);
          const costHeight = (point.purchaseCost / max) * (BASELINE - TOP);
          return (
            <g key={point.month}>
              <rect x={slotX} y={BASELINE - revenueHeight} width={BAR_WIDTH} height={revenueHeight} fill="#9184d9" opacity={0.85} rx={2} />
              <rect x={slotX + BAR_WIDTH} y={BASELINE - costHeight} width={BAR_WIDTH} height={costHeight} fill="#454a63" rx={2} />
              <text x={slotX + BAR_WIDTH} y={BASELINE + 18} textAnchor="middle" fontSize={11} fill="#8a8da0">
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 text-xs text-text/60 mt-1">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#9184d9" }} />
          Revenue
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#454a63" }} />
          Purchase cost
        </span>
      </div>
    </Card>
  );
}
