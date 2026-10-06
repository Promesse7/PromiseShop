"use client";

import { useState } from "react";
import { Card, CardKicker } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { RecordPaymentDialog } from "@/components/finance/RecordPaymentDialog";
import { useToast } from "@/components/layout/ToastProvider";
import { ApiError, extractErrorMessage } from "@/lib/api-client";
import { usePayments, useRecordSupplierPayment } from "@/lib/finance/useDebts";
import { PAYMENT_METHOD_LABELS } from "@/lib/pos/payments";
import { formatRwf } from "@/lib/format";
import type { Purchase } from "@/lib/types";

const STATUS_LABEL: Record<Purchase["payment_status"], string> = {
  paid: "Paid",
  partial: "Partly paid",
  unpaid: "Unpaid",
};

/** What the shop has paid this supplier for the purchase, and the balance (admin/manager). */
export function SupplierPaymentCard({ purchase }: { purchase: Purchase }) {
  const { show } = useToast();
  const payments = usePayments({ purchase: purchase.purchase_id });
  const record = useRecordSupplierPayment();
  const [open, setOpen] = useState(false);
  const owed = Number(purchase.total_paid ?? 0);
  const paid = Number(purchase.amount_paid ?? 0);
  const balance = Math.max(owed - paid, 0);

  return (
    <Card elevation="sm">
      <CardKicker>Supplier payments</CardKicker>
      <div className="flex justify-between text-sm">
        <span>Status</span>
        <span>
          <Tag variant={purchase.payment_status === "paid" ? "accent" : "warning"}>{STATUS_LABEL[purchase.payment_status]}</Tag>
        </span>
      </div>
      <div className="flex justify-between text-sm"><span>Paid so far</span><span>{formatRwf(paid)}</span></div>
      <div className="flex justify-between text-sm font-medium"><span>Balance</span><span>{formatRwf(balance)}</span></div>
      {purchase.payment_needs_review && (
        <p className="text-xs text-amber-500">Migrated — confirm amount paid (from the Debts page).</p>
      )}
      {(payments.data ?? []).map((p) => (
        <div key={p.payment_id} className="flex justify-between text-xs text-text/70">
          <span>
            {new Date(p.paid_at).toLocaleDateString("en-GB")} · {PAYMENT_METHOD_LABELS[p.method]}
            {p.reference ? ` · ${p.reference}` : ""}
          </span>
          <span>{formatRwf(p.amount)}</span>
        </div>
      ))}
      {purchase.status !== "cancelled" && balance > 0 && (
        <Button variant="secondary" className="mt-1" onClick={() => setOpen(true)}>
          Record supplier payment
        </Button>
      )}
      <RecordPaymentDialog
        open={open}
        title="Record supplier payment"
        subject={`#P-${purchase.purchase_id}`}
        maxAmount={balance}
        submitting={record.isPending}
        error={record.error instanceof ApiError ? extractErrorMessage(record.error.body) : null}
        onClose={() => { setOpen(false); record.reset(); }}
        onSubmit={(input) =>
          record.mutate(
            { ...input, purchase: purchase.purchase_id },
            { onSuccess: () => { setOpen(false); show("Supplier payment recorded.", "success"); } }
          )
        }
      />
    </Card>
  );
}
