"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AlertsList } from "@/components/dashboard/AlertsList";
import { LeakageCards } from "@/components/dashboard/LeakageCards";
import { MoneyWaterfall } from "@/components/dashboard/MoneyWaterfall";
import { PeopleTables } from "@/components/dashboard/PeopleTables";
import {
  downloadCsv,
  rwf,
  toCsv,
  useMoneyAlerts,
  useMoneyChain,
  useMoneyLeakage,
  useMoneyPeople,
  type DateRange,
} from "@/lib/dashboard/money";

export type MoneyTab = "money" | "people";

interface MoneyDashboardProps {
  range: DateRange;
  tab: MoneyTab;
}

/** The alerts list; shown above every tab. */
export function MoneyAlerts({ range }: { range: DateRange }) {
  const alerts = useMoneyAlerts(range);
  if (!alerts.data?.alerts) return null;
  return <AlertsList alerts={alerts.data.alerts} />;
}

export function MoneyDashboard({ range, tab }: MoneyDashboardProps) {
  const chain = useMoneyChain(range);
  const leakage = useMoneyLeakage(range);
  const people = useMoneyPeople(range);
  const suffix = `${range.from}_${range.to}`;

  if (tab === "people") {
    if (people.isLoading) return <p className="text-sm text-text/60">Loading people…</p>;
    if (!people.data?.cashiers) return <p className="text-sm text-text/60">Couldn&apos;t load the people view.</p>;
    const data = people.data;
    return (
      <div className="flex flex-col gap-3">
        <div className="flex justify-end">
          <Button
            variant="secondary"
            onClick={() =>
              downloadCsv(
                `people-${suffix}.csv`,
                toCsv(
                  ["Cashier", "Sales", "Value", "Avg discount %", "Approvals", "Below floor", "Voids", "Returns", "Returns value", "Day closes", "Variance"],
                  data.cashiers.map((r) => [
                    r.name, r.sales_count, r.sales_value, r.avg_discount_pct, r.approvals_received,
                    r.below_floor_approvals, r.voids, r.returns_count, r.returns_value, r.closes, r.variance_total,
                  ])
                )
              )
            }
          >
            Export CSV
          </Button>
        </div>
        <PeopleTables people={data} />
      </div>
    );
  }

  if (chain.isLoading) return <p className="text-sm text-text/60">Loading the money chain…</p>;
  if (!chain.data?.steps) return <p className="text-sm text-text/60">Couldn&apos;t load the money chain.</p>;
  const data = chain.data;
  const estimate = data.cogs_estimate;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          variant="secondary"
          onClick={() =>
            downloadCsv(
              `money-chain-${suffix}.csv`,
              toCsv(
                ["Step", "Amount (RWF)"],
                [
                  ...data.steps.map((s) => [s.label, s.amount]),
                  ...(leakage.data?.cards ?? []).map((c) => [c.label, c.value]),
                  ["Output VAT", data.vat.output_vat],
                  ["Input VAT", data.vat.input_vat],
                  [`Net VAT (${data.vat.label})`, data.vat.net_vat],
                ]
              )
            )
          }
        >
          Export CSV
        </Button>
      </div>
      <MoneyWaterfall steps={data.steps} />
      {estimate.estimated_lines > 0 && (
        <Card elevation="sm">
          <p className="text-xs text-amber-600">
            {estimate.estimated_lines} line(s) sold before costs were recorded at the till: their cost
            ({rwf(estimate.estimated_value)}) uses today&apos;s average cost.
          </p>
        </Card>
      )}
      {leakage.data?.cards && <LeakageCards cards={leakage.data.cards} vat={data.vat} />}
    </div>
  );
}
