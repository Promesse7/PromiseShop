import Link from "next/link";
import { Card, CardKicker } from "@/components/ui/Card";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Tag } from "@/components/ui/Tag";
import { buildReorderUrl } from "@/lib/purchasing/reorderUrl";
import type { CatalogProduct } from "@/lib/products/useCatalogProducts";

interface LowStockTableProps {
  rows: CatalogProduct[];
}

// The Reorder link sits inside each row, so rows aren't links themselves (no nested anchors);
// the product name links to its page instead.
const COLUMNS: DataColumn<CatalogProduct>[] = [
  {
    key: "name",
    header: "Product",
    primary: true,
    render: (r) => (
      <Link href={`/products/${r.product_id}`} className="font-medium text-text no-underline hover:text-accent">
        {r.name}
      </Link>
    ),
    sortValue: (r) => r.name,
  },
  { key: "quantity_in_stock", header: "On hand", align: "right", sortValue: (r) => r.quantity_in_stock },
  { key: "reorder_level", header: "Reorder at", align: "right" },
  {
    key: "status",
    header: "Status",
    render: (r) =>
      r.quantity_in_stock <= 0 ? <Tag variant="danger">Out of stock</Tag> : <Tag variant="warning">Low stock</Tag>,
  },
  {
    key: "reorder",
    header: "Action",
    render: (r) => (
      <Link href={buildReorderUrl(r.product_id, r.name)} className="text-xs text-accent">
        Reorder
      </Link>
    ),
  },
];

export function LowStockTable({ rows }: LowStockTableProps) {
  return (
    <Card elevation="sm" className="flex flex-col gap-2">
      <CardKicker>Low stock / out of stock</CardKicker>
      {rows.length === 0 ? (
        <p className="m-0 text-sm text-text/50">Nothing low on stock</p>
      ) : (
        <DataTable label="Low stock" columns={COLUMNS} rows={rows} rowKey={(r) => String(r.product_id)} />
      )}
    </Card>
  );
}
