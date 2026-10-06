import { StatStrip } from "@/components/ui/StatStrip";
import type { AgingBucket } from "@/lib/types";

export const AGING_LABELS: Record<AgingBucket, string> = {
  not_due: "Not due",
  "1_30": "1–30 days",
  "31_60": "31–60 days",
  "61_90": "61–90 days",
  "90_plus": "90+ days",
};

interface AgingTotalsProps {
  totals: Record<AgingBucket, string>;
  total: string;
}

/** Totals per aging bucket (days overdue), plus the grand total. Overdue buckets turn red. */
export function AgingTotals({ totals, total }: AgingTotalsProps) {
  const buckets = Object.keys(AGING_LABELS) as AgingBucket[];
  return (
    <StatStrip
      label="Aging totals"
      stats={[
        { label: "Total", amount: total },
        ...buckets.map((bucket) => ({
          label: AGING_LABELS[bucket],
          amount: totals[bucket],
          tone: bucket !== "not_due" && Number(totals[bucket]) > 0 ? ("danger" as const) : ("default" as const),
        })),
      ]}
    />
  );
}
