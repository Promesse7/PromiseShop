import { Card, CardKicker } from "@/components/ui/Card";
import { Table } from "@/components/ui/Table";
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
        ]}
        rows={rows}
        rowKey={(r) => String(r.product_id)}
        emptyMessage="Nothing low on stock"
      />
    </Card>
  );
}
