import { Card, CardKicker } from "@/components/ui/Card";
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

/** Totals per aging bucket (days overdue), plus the grand total. */
export function AgingTotals({ totals, total }: AgingTotalsProps) {
  const buckets = Object.keys(AGING_LABELS) as AgingBucket[];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
      <Card elevation="sm">
        <CardKicker>Total</CardKicker>
        <div className="font-sans font-medium text-lg">RWF {Number(total).toLocaleString()}</div>
      </Card>
      {buckets.map((bucket) => (
        <Card key={bucket} elevation="sm">
          <CardKicker>{AGING_LABELS[bucket]}</CardKicker>
          <div className={`font-sans font-medium text-lg ${bucket !== "not_due" && Number(totals[bucket]) > 0 ? "text-red-400" : ""}`}>
            RWF {Number(totals[bucket]).toLocaleString()}
          </div>
        </Card>
      ))}
    </div>
  );
}
