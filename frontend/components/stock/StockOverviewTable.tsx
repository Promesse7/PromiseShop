"use client";

import { Table } from "@/components/ui/Table";
import { Tag } from "@/components/ui/Tag";
import type { StockOverviewRow } from "@/lib/stock/useStockOverview";

const FLAG_TAG: Record<StockOverviewRow["flag"], { label: string; variant: "accent" | "outline" | "neutral" } | null> = {
  ok: null,
  low_stock: { label: "Low stock", variant: "outline" },
  out_of_stock: { label: "Out of stock", variant: "neutral" },
};

interface StockOverviewTableProps {
  rows: StockOverviewRow[];
  onSelectProduct: (productId: number) => void;
}

export function StockOverviewTable({ rows, onSelectProduct }: StockOverviewTableProps) {
  const columns = [
    { key: "name", header: "Product" },
    { key: "quantity_in_stock", header: "In stock" },
    { key: "quantity_in_use", header: "In use" },
    { key: "quantity_damaged", header: "Damaged" },
    {
      key: "storage_location",
      header: "Location",
      render: (row: StockOverviewRow) => row.storage_location ?? "—",
    },
    {
      key: "flag",
      header: "Flag",
      render: (row: StockOverviewRow) => {
        const tag = FLAG_TAG[row.flag];
        return tag ? <Tag variant={tag.variant}>{tag.label}</Tag> : null;
      },
    },
    {
      key: "units",
      header: "",
      render: (row: StockOverviewRow) =>
        row.unit_count > 0 ? (
          <button
            type="button"
            className="text-xs text-accent underline"
            onClick={() => onSelectProduct(row.product_id)}
          >
            {row.unit_count} units
          </button>
        ) : (
          <span className="text-xs text-text/50">aggregate only</span>
        ),
    },
  ];

  return (
    <Table
      columns={columns}
      rows={rows}
      rowKey={(row) => String(row.product_id)}
      emptyMessage="No stock recorded yet"
    />
  );
}
