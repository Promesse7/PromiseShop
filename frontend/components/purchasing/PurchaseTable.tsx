"use client";

import type { ReactNode } from "react";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Tag } from "@/components/ui/Tag";
import type { PurchaseListRow } from "@/lib/purchasing/usePurchases";

const STATUS_TAG: Record<PurchaseListRow["status"], { label: string; variant: "accent" | "outline" | "neutral" }> = {
  draft: { label: "Draft", variant: "outline" },
  received: { label: "Received", variant: "accent" },
  cancelled: { label: "Cancelled", variant: "neutral" },
};

export const PAYMENT_LABEL: Record<PurchaseListRow["payment_status"], string> = {
  paid: "Paid",
  partial: "Partial",
  unpaid: "Unpaid",
};

interface PurchaseTableProps {
  rows: PurchaseListRow[];
  /** Admin/manager only: the paid and invoiced totals. */
  showTotals: boolean;
  /** Shown instead of the table when there are no rows. */
  empty?: ReactNode;
}

/** Purchases as a sortable table on desktop and tappable cards on phone; each opens its workspace. */
export function PurchaseTable({ rows, showTotals, empty }: PurchaseTableProps) {
  const columns: DataColumn<PurchaseListRow>[] = [
    {
      key: "supplier_name",
      header: "Supplier",
      primary: true,
      sortValue: (r) => r.supplier_name,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => {
        const tag = STATUS_TAG[r.status];
        return <Tag variant={tag.variant}>{tag.label}</Tag>;
      },
      sortValue: (r) => r.status,
    },
    { key: "purchase_date", header: "Date", sortValue: (r) => r.purchase_date },
    {
      key: "invoice_number",
      header: "Invoice #",
      render: (r) => r.invoice_number ?? "—",
    },
    {
      key: "payment_status",
      header: "Payment",
      render: (r) => PAYMENT_LABEL[r.payment_status],
      sortValue: (r) => r.payment_status,
    },
    ...(showTotals
      ? [
          {
            key: "total_paid",
            header: "Total paid",
            money: true,
            sortValue: (r: PurchaseListRow) => Number(r.total_paid ?? 0),
          },
          {
            key: "total_invoiced",
            header: "Total invoiced",
            money: true,
            mobile: false,
            sortValue: (r: PurchaseListRow) => Number(r.total_invoiced ?? 0),
          },
        ]
      : []),
  ];

  return (
    <DataTable
      label="Purchases"
      columns={columns}
      rows={rows}
      rowKey={(r) => String(r.purchase_id)}
      rowHref={(r) => `/purchases/${r.purchase_id}`}
      empty={empty}
    />
  );
}
