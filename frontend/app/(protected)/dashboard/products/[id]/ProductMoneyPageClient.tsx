"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api-client";
import { AdminOnlyNotice } from "@/components/dashboard/AdminOnlyNotice";
import { PeriodPicker } from "@/components/dashboard/PeriodPicker";
import { Button } from "@/components/ui/Button";
import { Card, CardKicker } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
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
    return <AdminOnlyNotice />;
  }

  const data = money.data;
  return (
    <div>
      <PageHeader title={data?.name ?? "Product"} subtitle="Money drill-down">
        <Link href={`/products/${productId}`} className="ml-auto text-sm text-accent">
          ← Product
        </Link>
      </PageHeader>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <PeriodPicker
          preset={preset}
          range={range}
          onChange={(nextPreset, nextRange) => {
            setPreset(nextPreset);
            setRange(nextRange);
          }}
        />
        {data && (
          <Button
            variant="secondary"
            className="ml-auto"
            onClick={() =>
              downloadCsv(
                `product-${productId}-${range.from}_${range.to}.csv`,
                toCsv(["Figure", "Value"], ROWS.map((row) => [row.label, row.value(data)]))
              )
            }
          >
            Export CSV
          </Button>
        )}
      </div>
      <Card elevation="sm">
        <CardKicker>
          {range.from} → {range.to}
        </CardKicker>
        {money.isLoading && <p className="text-sm text-text/60">Loading…</p>}
        {money.isError && !(money.error instanceof ApiError && money.error.status === 403) && (
          <p className="text-sm text-red-400">Couldn&apos;t load this product&apos;s figures.</p>
        )}
        {data && (
          <table className="w-full text-sm" aria-label="Product money">
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-b border-divider">
                  <td className="py-1.5 pr-2">{row.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.value(data)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
