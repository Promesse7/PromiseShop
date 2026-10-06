import Link from "next/link";
import { Table } from "@/components/ui/Table";
import { PURPOSE_LABELS, formatValue } from "@/lib/operations/labels";
import type { InternalConsumption } from "@/lib/types";

interface ConsumptionTableProps {
  rows: InternalConsumption[];
  showValue: boolean;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function ConsumptionTable({ rows, showValue }: ConsumptionTableProps) {
  const columns = [
    { key: "date", header: "When", render: (r: InternalConsumption) => formatDate(r.created_at) },
    {
      key: "product",
      header: "Product",
      render: (r: InternalConsumption) => <Link href={`/products/${r.product}`} className="text-accent">{r.product_name}</Link>,
    },
    { key: "qty", header: "Qty", render: (r: InternalConsumption) => r.quantity },
    { key: "purpose", header: "Purpose", render: (r: InternalConsumption) => PURPOSE_LABELS[r.purpose] },
    {
      key: "reason",
      header: "Reason",
      render: (r: InternalConsumption) => (
        <span>
          {r.reason}
          {r.shop_asset_name && <span className="text-text/50"> · for {r.shop_asset_name}</span>}
        </span>
      ),
    },
    { key: "taken", header: "Taken by", render: (r: InternalConsumption) => r.taken_by_name ?? "—" },
    { key: "approved", header: "Approved by", render: (r: InternalConsumption) => r.approved_by_name ?? "—" },
    ...(showValue
      ? [{ key: "value", header: "Value", render: (r: InternalConsumption) => formatValue(r.total_value) }]
      : []),
  ];
  return (
    <Table
      columns={columns}
      rows={rows}
      rowKey={(r) => String(r.consumption_id)}
      emptyMessage="Nothing used in the shop for these filters"
    />
  );
}
