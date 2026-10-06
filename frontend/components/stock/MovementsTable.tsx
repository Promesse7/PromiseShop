"use client";

import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { BUCKET_LABELS, MOVEMENT_TYPE_LABELS, formatDelta } from "@/lib/stock/movements";
import { formatRwf } from "@/lib/format";
import type { StockMovement } from "@/lib/types";

interface MovementsTableProps {
  movements: StockMovement[];
  /** Admin and manager only; the API leaves unit_cost out for staff anyway. */
  showCost: boolean;
  /** The product column is redundant on a single product's page. */
  showProduct?: boolean;
  emptyMessage?: string;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function MovementsTable({ movements, showCost, showProduct = true, emptyMessage = "No stock movements" }: MovementsTableProps) {
  const columns: DataColumn<StockMovement>[] = [
    ...(showProduct
      ? [
          {
            key: "product",
            header: "Product",
            primary: true,
            sortValue: (m: StockMovement) => m.product_name,
            render: (m: StockMovement) => (
              <Link href={`/products/${m.product}`} className="text-accent">
                {m.product_name}
              </Link>
            ),
          },
        ]
      : []),
    {
      key: "created_at",
      header: "When",
      primary: !showProduct,
      mobile: true,
      sortValue: (m) => m.created_at,
      render: (m) => formatWhen(m.created_at),
    },
    {
      key: "movement_type",
      header: "Type",
      mobile: true,
      render: (m) => MOVEMENT_TYPE_LABELS[m.movement_type] ?? m.movement_type,
    },
    { key: "bucket", header: "Bucket", render: (m) => BUCKET_LABELS[m.bucket] ?? m.bucket },
    {
      key: "quantity_delta",
      header: "Change",
      align: "right",
      mobile: true,
      sortValue: (m) => m.quantity_delta,
      render: (m) => (
        <span className={`tabular-nums ${m.quantity_delta < 0 ? "text-red-500" : "text-accent"}`}>
          {formatDelta(m.quantity_delta)}
        </span>
      ),
    },
    {
      key: "balance_after",
      header: "Balance after",
      align: "right",
      mobile: true,
      render: (m) => String(m.balance_after),
    },
    ...(showCost
      ? [
          {
            key: "unit_cost",
            header: "Unit cost",
            align: "right" as const,
            render: (m: StockMovement) => (m.unit_cost != null ? formatRwf(m.unit_cost) : "—"),
          },
        ]
      : []),
    { key: "created_by", header: "By", render: (m) => m.created_by_name ?? "System" },
    { key: "reason", header: "Reason", render: (m) => <span className="text-text/60">{m.reason || "—"}</span> },
  ];

  return (
    <DataTable
      label="Stock movements"
      columns={columns}
      rows={movements}
      rowKey={(m) => String(m.movement_id)}
      empty={<EmptyState icon={ArrowLeftRight} title={emptyMessage} />}
    />
  );
}
