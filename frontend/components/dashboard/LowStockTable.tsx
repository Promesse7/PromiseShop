import Link from "next/link";
import { Card, CardKicker } from "@/components/ui/Card";
import { Table } from "@/components/ui/Table";
import { Tag } from "@/components/ui/Tag";
import { buildReorderUrl } from "@/lib/purchasing/reorderUrl";
import type { CatalogProduct } from "@/lib/products/useCatalogProducts";

interface LowStockTableProps {
  rows: CatalogProduct[];
}

export function LowStockTable({ rows }: LowStockTableProps) {
  return (
    <Card elevation="sm">
      <CardKicker>Low stock / out of stock</CardKicker>
      <Table
        columns={[
          { key: "name", header: "Product" },
          { key: "quantity_in_stock", header: "On hand", render: (r) => r.quantity_in_stock },
          { key: "reorder_level", header: "Reorder at", render: (r) => r.reorder_level },
          {
            key: "status",
            header: "Status",
            render: (r) =>
              r.quantity_in_stock <= 0 ? (
                <Tag variant="danger">Out of stock</Tag>
              ) : (
                <Tag variant="warning">Low stock</Tag>
              ),
          },
          {
            key: "reorder",
            header: "",
            render: (r) => (
              <Link href={buildReorderUrl(r.product_id, r.name)} className="text-xs text-accent">
                Reorder
              </Link>
            ),
          },
        ]}
        rows={rows}
        rowKey={(r) => String(r.product_id)}
        emptyMessage="Nothing low on stock"
      />
    </Card>
  );
}
