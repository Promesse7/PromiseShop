import { motion } from "motion/react";
import { Card, CardKicker } from "@/components/ui/Card";
import { DURATION, EASE, useReducedMotionSafe } from "@/lib/motion";
import { rwf, type ChainStep } from "@/lib/dashboard/money";

interface MoneyWaterfallProps {
  steps: ChainStep[];
}

const WIDTH = 760;
const HEIGHT = 260;
const TOP = 16;
const BOTTOM = 210;

interface Bar {
  step: ChainStep;
  start: number;
  end: number;
}

/** Lay the chain out as floating bars: totals stand on zero, deltas float from the running total. */
export function waterfallBars(steps: ChainStep[]): Bar[] {
  let running = 0;
  return steps.map((step) => {
    const amount = Number(step.amount);
    if (step.kind === "total") {
      running = amount;
      return { step, start: 0, end: amount };
    }
    const bar = { step, start: running, end: running + amount };
    running += amount;
    return bar;
  });
}

// The bars grow one after another; the whole sequence stays within DURATION.slow.
const GROW = DURATION.base;

export function MoneyWaterfall({ steps }: MoneyWaterfallProps) {
  const reduced = useReducedMotionSafe();
  const bars = waterfallBars(steps);
  const stagger = bars.length > 1 ? (DURATION.slow - GROW) / (bars.length - 1) : 0;
  const values = bars.flatMap((b) => [b.start, b.end, 0]);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const scale = (v: number) => BOTTOM - ((v - min) / (max - min)) * (BOTTOM - TOP);
  const slot = WIDTH / Math.max(1, bars.length);
  const barWidth = Math.min(48, slot * 0.6);

  return (
    <Card variant="glass">
      <CardKicker>Where the money went — catalog value to operating profit</CardKicker>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" role="img" aria-label="Money chain waterfall">
        <line x1={0} x2={WIDTH} y1={scale(0)} y2={scale(0)} className="stroke-current text-text/20" />
        {bars.map((bar, i) => {
          const x = i * slot + (slot - barWidth) / 2;
          const y = Math.min(scale(bar.start), scale(bar.end));
          const h = Math.max(1, Math.abs(scale(bar.start) - scale(bar.end)));
          const amount = Number(bar.step.amount);
          const tone =
            bar.step.kind === "total" ? "text-accent" : amount < 0 ? "text-rose-500" : "text-emerald-500";
          return (
            <g key={bar.step.key}>
              <motion.rect
                x={x}
                y={y}
                width={barWidth}
                height={h}
                rx={3}
                className={`fill-current ${tone}`}
                // A delta that lowers the total grows downward from the previous running total.
                style={{ transformBox: "fill-box", originY: amount < 0 && bar.step.kind === "delta" ? 0 : 1 }}
                initial={reduced ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: GROW, ease: EASE.out, delay: i * stagger }}
              >
                <title>{`${bar.step.label}: ${rwf(bar.step.amount)}`}</title>
              </motion.rect>
              <text
                x={x + barWidth / 2}
                y={y - 4}
                textAnchor="middle"
                className="fill-current text-text/80"
                fontSize={10}
              >
                {Math.round(amount / 1000).toLocaleString()}k
              </text>
              <text
                x={x + barWidth / 2}
                y={BOTTOM + 16}
                textAnchor="middle"
                className="fill-current text-text/60"
                fontSize={9}
              >
                {bar.step.label.length > 14 ? `${bar.step.label.slice(0, 13)}…` : bar.step.label}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="w-full text-sm mt-2">
        <tbody>
          {steps.map((step) => (
            <tr key={step.key} className={step.kind === "total" ? "font-semibold border-t border-divider" : ""}>
              <td className="py-1 pr-2">{step.kind === "delta" ? `  ${step.label}` : step.label}</td>
              <td className="py-1 text-right tabular-nums">{rwf(step.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
