import { Card, CardKicker } from "@/components/ui/Card";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import type { SlowMoverRow } from "@/lib/dashboard/useDashboardData";

interface SlowMoversTableProps {
  rows: SlowMoverRow[];
}

function formatLastSold(value: string | null): string {
  if (!value) return "Never sold";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

const COLUMNS: DataColumn<SlowMoverRow>[] = [
  { key: "product_name", header: "Product", primary: true, sortValue: (r) => r.product_name },
  { key: "quantity_in_stock", header: "On hand", align: "right", sortValue: (r) => r.quantity_in_stock },
  { key: "last_sold", header: "Last sold", render: (r) => formatLastSold(r.last_sold), sortValue: (r) => r.last_sold ?? "" },
];

export function SlowMoversTable({ rows }: SlowMoversTableProps) {
  return (
    <Card elevation="sm" className="flex flex-col gap-2">
      <CardKicker>Slow movers — no sale in 30+ days</CardKicker>
      {rows.length === 0 ? (
        <p className="m-0 text-sm text-text/50">Nothing slow moving</p>
      ) : (
        <DataTable
          label="Slow movers"
          columns={COLUMNS}
          rows={rows}
          rowKey={(r) => String(r.product_id)}
          rowHref={(r) => `/products/${r.product_id}`}
        />
      )}
    </Card>
  );
}
