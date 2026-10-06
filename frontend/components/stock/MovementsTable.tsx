"use client";

import Link from "next/link";
import { Table } from "@/components/ui/Table";
import { BUCKET_LABELS, MOVEMENT_TYPE_LABELS, formatDelta } from "@/lib/stock/movements";
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
  const columns = [
    { key: "created_at", header: "When", render: (m: StockMovement) => formatWhen(m.created_at) },
    ...(showProduct
      ? [{
          key: "product",
          header: "Product",
          render: (m: StockMovement) => (
            <Link href={`/products/${m.product}`} className="text-accent">{m.product_name}</Link>
          ),
        }]
      : []),
    { key: "movement_type", header: "Type", render: (m: StockMovement) => MOVEMENT_TYPE_LABELS[m.movement_type] ?? m.movement_type },
    { key: "bucket", header: "Bucket", render: (m: StockMovement) => BUCKET_LABELS[m.bucket] ?? m.bucket },
    {
      key: "quantity_delta",
      header: "Change",
      render: (m: StockMovement) => (
        <span className={m.quantity_delta < 0 ? "text-red-400" : "text-accent"}>{formatDelta(m.quantity_delta)}</span>
      ),
    },
    { key: "balance_after", header: "Balance after", render: (m: StockMovement) => String(m.balance_after) },
    ...(showCost
      ? [{
          key: "unit_cost",
          header: "Unit cost",
          render: (m: StockMovement) => (m.unit_cost != null ? Number(m.unit_cost).toLocaleString() : "—"),
        }]
      : []),
    { key: "created_by", header: "By", render: (m: StockMovement) => m.created_by_name ?? "System" },
    { key: "reason", header: "Reason", render: (m: StockMovement) => <span className="text-text/60">{m.reason || "—"}</span> },
  ];

  return (
    <Table columns={columns} rows={movements} rowKey={(m) => String(m.movement_id)} emptyMessage={emptyMessage} />
  );
}
