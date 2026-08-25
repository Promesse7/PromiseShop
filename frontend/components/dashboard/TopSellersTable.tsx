import { Card, CardKicker } from "@/components/ui/Card";
import { Table } from "@/components/ui/Table";
import type { TopSellerRow } from "@/lib/dashboard/useDashboardData";

interface TopSellersTableProps {
  rows: TopSellerRow[];
}

export function TopSellersTable({ rows }: TopSellersTableProps) {
  return (
    <Card elevation="sm">
      <CardKicker>Top sellers — this month</CardKicker>
      <Table
        columns={[
          { key: "product_name", header: "Product" },
          { key: "units", header: "Units", render: (r) => r.units },
          { key: "revenue", header: "Revenue", render: (r) => r.revenue.toLocaleString() },
        ]}
        rows={rows}
        rowKey={(r) => String(r.product_id)}
        emptyMessage="No sales yet this month"
      />
    </Card>
  );
}
