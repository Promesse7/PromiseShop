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

function formatRwf(value: number): string {
  return `RWF ${Math.round(value).toLocaleString()}`;
}

export function RevenueTrendChart({ points }: RevenueTrendChartProps) {
  const max = Math.max(1, ...points.flatMap((p) => [p.revenue, p.purchaseCost]));
  const slotWidth = points.length > 0 ? WIDTH / points.length : WIDTH;
  const gridLines = [0.25, 0.5, 0.75].map((f) => BASELINE - f * (BASELINE - TOP));

  return (
    <Card variant="glass">
      <CardKicker>Revenue vs purchase cost — {points.length} months</CardKicker>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label="Revenue vs purchase cost, trailing months"
      >
        {gridLines.map((y) => (
          <line key={y} x1={0} y1={y} x2={WIDTH} y2={y} stroke="#eceef5" />
        ))}
        <line x1={0} y1={BASELINE} x2={WIDTH} y2={BASELINE} stroke="#dbdee9" />
        {points.map((point, i) => {
          const slotX = i * slotWidth + slotWidth / 2 - BAR_WIDTH;
          const revenueHeight = (point.revenue / max) * (BASELINE - TOP);
          const costHeight = (point.purchaseCost / max) * (BASELINE - TOP);
          return (
            <g key={point.month}>
              <rect
                className="chart-bar"
                style={{ animationDelay: `${i * 40}ms` }}
                x={slotX}
                y={BASELINE - revenueHeight}
                width={BAR_WIDTH}
                height={revenueHeight}
                fill="#6c5cd6"
                opacity={0.9}
                rx={2}
              >
                <title>{`${point.label}: ${formatRwf(point.revenue)} revenue`}</title>
              </rect>
              <rect
                className="chart-bar"
                style={{ animationDelay: `${i * 40 + 20}ms` }}
                x={slotX + BAR_WIDTH}
                y={BASELINE - costHeight}
                width={BAR_WIDTH}
                height={costHeight}
                fill="#b9bdcd"
                rx={2}
              >
                <title>{`${point.label}: ${formatRwf(point.purchaseCost)} purchase cost`}</title>
              </rect>
              <text x={slotX + BAR_WIDTH} y={BASELINE + 18} textAnchor="middle" fontSize={11} fill="#6f7386">
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 text-xs text-text/60 mt-1">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#6c5cd6" }} />
          Revenue
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#b9bdcd" }} />
          Purchase cost
        </span>
      </div>
    </Card>
  );
}
