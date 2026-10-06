"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { AdminOnlyNotice } from "@/components/dashboard/AdminOnlyNotice";
import { PeriodPicker } from "@/components/dashboard/PeriodPicker";
import { Button } from "@/components/ui/Button";
import { Card, CardKicker } from "@/components/ui/Card";
import { Page, Toolbar } from "@/components/ui/Page";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import {
  downloadCsv,
  presetRange,
  rwf,
  toCsv,
  useProductMoney,
  type DateRange,
  type PeriodPreset,
  type ProductMoney,
} from "@/lib/dashboard/money";

const ROWS: { label: string; value: (p: ProductMoney) => string }[] = [
  { label: "Paid cost per unit (average)", value: (p) => rwf(p.avg_cost_paid) },
  { label: "Invoiced cost per unit (average)", value: (p) => rwf(p.avg_cost_invoiced) },
  { label: "Catalog price", value: (p) => rwf(p.catalog_price) },
  { label: "Average sold price", value: (p) => rwf(p.avg_sold_price) },
  { label: "VAT per unit sold", value: (p) => rwf(p.vat_per_unit) },
  { label: "Units sold (kept)", value: (p) => String(p.units_sold) },
  { label: "Revenue (VAT incl.)", value: (p) => rwf(p.revenue) },
  { label: "Cost of goods sold", value: (p) => rwf(p.cogs) },
  {
    label: "Actual margin",
    value: (p) => (p.actual_margin == null ? "—" : `${rwf(p.actual_margin)} · ${p.actual_margin_pct ?? "—"}%`),
  },
  { label: "Projected margin per unit (catalog − invoiced)", value: (p) => rwf(p.projected_margin_per_unit) },
  { label: "Units used internally", value: (p) => `${p.units_consumed_internally} (${rwf(p.value_consumed_internally)})` },
  { label: "Units damaged", value: (p) => `${p.units_damaged} (${rwf(p.value_damaged)})` },
  { label: "In stock now", value: (p) => String(p.in_stock) },
  { label: "Stock value at average cost", value: (p) => rwf(p.stock_value) },
];

export default function ProductMoneyPageClient({ productId }: { productId: number }) {
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [range, setRange] = useState<DateRange>(() => presetRange("month"));
  const money = useProductMoney(productId, range);

  if (money.error instanceof ApiError && money.error.status === 403) {
    return (
      <Page title="Product money" back={`/products/${productId}`}>
        <AdminOnlyNotice />
      </Page>
    );
  }

  const data = money.data;
  return (
    <Page
      title={data?.name ?? "Product"}
      description="Money drill-down: what this product cost, earned and lost in the period."
      back={`/products/${productId}`}
      toolbar={
        <Toolbar
          filters={
            <PeriodPicker
              preset={preset}
              range={range}
              onChange={(nextPreset, nextRange) => {
                setPreset(nextPreset);
                setRange(nextRange);
              }}
            />
          }
          activeFilterCount={preset !== "month" ? 1 : 0}
          trailing={
            data ? (
              <Button
                variant="secondary"
                onClick={() =>
                  downloadCsv(
                    `product-${productId}-${range.from}_${range.to}.csv`,
                    toCsv(["Figure", "Value"], ROWS.map((row) => [row.label, row.value(data)]))
                  )
                }
              >
                Export CSV
              </Button>
            ) : undefined
          }
        />
      }
    >
      {money.isLoading ? (
        <LoadingState variant="detail" label="Loading this product's figures…" />
      ) : money.isError || !data ? (
        <ErrorState message="Couldn't load this product's figures." onRetry={() => void money.refetch()} />
      ) : (
        <Card elevation="sm" className="flex flex-col gap-2">
          <CardKicker>
            {range.from} → {range.to}
          </CardKicker>
          <dl aria-label="Product money" className="m-0 divide-y divide-divider text-sm">
            {ROWS.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="text-text/70">{row.label}</dt>
                <dd className="m-0 text-right tabular-nums">{row.value(data)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </Page>
  );
}
