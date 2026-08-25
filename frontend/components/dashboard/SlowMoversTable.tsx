import { Card, CardKicker } from "@/components/ui/Card";
import { Table } from "@/components/ui/Table";
import type { SlowMoverRow } from "@/lib/dashboard/useDashboardData";

interface SlowMoversTableProps {
  rows: SlowMoverRow[];
}

function formatLastSold(value: string | null): string {
  if (!value) return "Never sold";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function SlowMoversTable({ rows }: SlowMoversTableProps) {
  return (
    <Card elevation="sm">
      <CardKicker>Slow movers — no sale in 30+ days</CardKicker>
      <Table
        columns={[
          { key: "product_name", header: "Product" },
          { key: "quantity_in_stock", header: "On hand", render: (r) => r.quantity_in_stock },
          { key: "last_sold", header: "Last sold", render: (r) => formatLastSold(r.last_sold) },
        ]}
        rows={rows}
        rowKey={(r) => String(r.product_id)}
        emptyMessage="Nothing slow moving"
      />
    </Card>
  );
}
