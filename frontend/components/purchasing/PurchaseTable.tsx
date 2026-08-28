"use client";

import Link from "next/link";
import { Table } from "@/components/ui/Table";
import { Tag } from "@/components/ui/Tag";
import type { PurchaseListRow } from "@/lib/purchasing/usePurchases";

const STATUS_TAG: Record<PurchaseListRow["status"], { label: string; variant: "accent" | "outline" | "neutral" }> = {
  draft: { label: "Draft", variant: "outline" },
  received: { label: "Received", variant: "accent" },
  cancelled: { label: "Cancelled", variant: "neutral" },
};

const PAYMENT_LABEL: Record<PurchaseListRow["payment_status"], string> = {
  paid: "Paid",
  partial: "Partial",
  unpaid: "Unpaid",
};

function formatMoney(value?: string): string {
  if (value == null) return "—";
  return Number(value).toLocaleString();
}

interface PurchaseTableProps {
  rows: PurchaseListRow[];
  showTotals: boolean;
}

export function PurchaseTable({ rows, showTotals }: PurchaseTableProps) {
  const columns = [
    { key: "supplier_name", header: "Supplier" },
    {
      key: "invoice_number",
      header: "Invoice #",
      render: (r: PurchaseListRow) => r.invoice_number ?? "—",
    },
    { key: "purchase_date", header: "Date" },
    {
      key: "payment_status",
      header: "Payment status",
      render: (r: PurchaseListRow) => PAYMENT_LABEL[r.payment_status],
    },
    {
      key: "status",
      header: "Status",
      render: (r: PurchaseListRow) => {
        const tag = STATUS_TAG[r.status];
        return <Tag variant={tag.variant}>{tag.label}</Tag>;
      },
    },
    ...(showTotals
      ? [
          {
            key: "total_paid",
            header: "Total paid",
            render: (r: PurchaseListRow) => formatMoney(r.total_paid),
          },
        ]
      : []),
    {
      key: "open",
      header: "",
      render: (r: PurchaseListRow) => <Link href={`/purchases/${r.purchase_id}`}>Open</Link>,
    },
  ];

  return (
    <Table columns={columns} rows={rows} rowKey={(r) => String(r.purchase_id)} emptyMessage="No purchases yet" />
  );
}
