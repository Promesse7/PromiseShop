"use client";

import Link from "next/link";
import { Wrench } from "lucide-react";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { PURPOSE_LABELS, formatValue } from "@/lib/operations/labels";
import type { InternalConsumption } from "@/lib/types";

interface ConsumptionTableProps {
  rows: InternalConsumption[];
  showValue: boolean;
  emptyMessage?: string;
  /** Hide the product column when the table is already scoped to one product. */
  hideProduct?: boolean;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function ConsumptionTable({
  rows,
  showValue,
  emptyMessage = "Nothing used in the shop for these filters",
  hideProduct = false,
}: ConsumptionTableProps) {
  const columns: DataColumn<InternalConsumption>[] = [
    ...(hideProduct
      ? []
      : [
          {
            key: "product",
            header: "Product",
            primary: true,
            sortValue: (r: InternalConsumption) => r.product_name,
            render: (r: InternalConsumption) => (
              <Link href={`/products/${r.product}`} className="text-accent">
                {r.product_name}
              </Link>
            ),
          },
        ]),
    {
      key: "date",
      header: "When",
      primary: hideProduct,
      sortValue: (r) => r.created_at,
      render: (r) => formatDate(r.created_at),
      mobile: true,
    },
    { key: "qty", header: "Qty", align: "right", sortValue: (r) => r.quantity, render: (r) => r.quantity, mobile: true },
    { key: "purpose", header: "Purpose", render: (r) => PURPOSE_LABELS[r.purpose], mobile: true },
    {
      key: "reason",
      header: "Reason",
      render: (r) => (
        <span>
          {r.reason}
          {r.shop_asset_name && <span className="text-text/50"> · for {r.shop_asset_name}</span>}
        </span>
      ),
    },
    { key: "taken", header: "Taken by", render: (r) => r.taken_by_name ?? "—", mobile: true },
    { key: "approved", header: "Approved by", render: (r) => r.approved_by_name ?? "—" },
    ...(showValue
      ? [
          {
            key: "value",
            header: "Value",
            align: "right" as const,
            render: (r: InternalConsumption) => formatValue(r.total_value),
          },
        ]
      : []),
  ];
  return (
    <DataTable
      label="Consumption log"
      columns={columns}
      rows={rows}
      rowKey={(r) => String(r.consumption_id)}
      defaultSort={{ key: "date", dir: "desc" }}
      empty={<EmptyState icon={Wrench} title={emptyMessage} />}
    />
  );
}
