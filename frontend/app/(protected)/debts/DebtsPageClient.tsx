"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { AgingTotals } from "@/components/finance/AgingTotals";
import { RecordPaymentDialog } from "@/components/finance/RecordPaymentDialog";
import { PaymentReceipt } from "@/components/finance/PaymentReceipt";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/layout/ToastProvider";
import { ApiError, extractErrorMessage } from "@/lib/api-client";
import {
  useConfirmPurchaseReview, useCustomerDebts, useRecordCustomerPayment, useRecordSupplierPayment, useSupplierDebts,
} from "@/lib/finance/useDebts";
import type { CustomerDebtRow, CustomerPaymentResult, SupplierDebtPurchase, SupplierDebtRow } from "@/lib/types";

interface DebtsPageClientProps {
  canView: boolean;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function messageOf(error: unknown) {
  return error instanceof ApiError ? extractErrorMessage(error.body) : "Something went wrong — try again.";
}

export default function DebtsPageClient({ canView }: DebtsPageClientProps) {
  const [tab, setTab] = useState<"customers" | "suppliers">("customers");

  if (!canView) {
    return (
      <div className="text-sm text-text/70">
        <h4 className="m-0 mb-2">Debts</h4>
        <p>This screen is limited to Admin and Manager accounts. Record a customer&apos;s payment from their customer page.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Debts">
        <div className="ml-4">
          <SegmentedToggle
            name="debts-tab"
            options={[
              { value: "customers", label: "Customers owe us" },
              { value: "suppliers", label: "We owe suppliers" },
            ]}
            value={tab}
            onChange={(value) => setTab(value as "customers" | "suppliers")}
          />
        </div>
      </PageHeader>
      {tab === "customers" ? <CustomerDebts /> : <SupplierDebts />}
    </div>
  );
}

function CustomerDebts() {
  const debts = useCustomerDebts();
  const record = useRecordCustomerPayment();
  const [paying, setPaying] = useState<CustomerDebtRow | null>(null);
  const [receipt, setReceipt] = useState<{ result: CustomerPaymentResult; name: string } | null>(null);

  if (debts.isError) return <ErrorState message="Couldn't load customer debts." />;
  if (debts.isLoading || !debts.data) return <p className="text-sm text-text/50">Loading…</p>;

  return (
    <>
      <AgingTotals totals={debts.data.totals} total={debts.data.total} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-divider text-text/70">
              <th className="text-left font-medium py-2 px-2">Customer</th>
              <th className="text-left font-medium py-2 px-2">Phone</th>
              <th className="text-right font-medium py-2 px-2">Open sales</th>
              <th className="text-right font-medium py-2 px-2">Balance</th>
              <th className="text-left font-medium py-2 px-2">Oldest due</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {debts.data.rows.length === 0 ? (
              <tr><td colSpan={6} className="py-6 text-center text-text/50">No customer owes the shop anything.</td></tr>
            ) : (
              debts.data.rows.map((row) => (
                <tr key={row.customer_id} className={`border-b border-divider ${row.overdue ? "bg-red-500/5" : ""}`}>
                  <td className="py-2 px-2">
                    <Link href={`/customers/${row.customer_id}`} className="underline">{row.name ?? "—"}</Link>
                  </td>
                  <td className="py-2 px-2">{row.phone ?? "—"}</td>
                  <td className="py-2 px-2 text-right">{row.open_sales}</td>
                  <td className="py-2 px-2 text-right">RWF {Number(row.balance).toLocaleString()}</td>
                  <td className="py-2 px-2">
                    {formatDate(row.oldest_due_date)} {row.overdue && <Tag variant="danger">Overdue</Tag>}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <Button variant="ghost" className="text-xs" onClick={() => setPaying(row)}>Record payment</Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <RecordPaymentDialog
        open={paying !== null}
        title="Record customer payment"
        subject={paying?.name ?? ""}
        maxAmount={Number(paying?.balance ?? 0)}
        submitting={record.isPending}
        error={record.error ? messageOf(record.error) : null}
        onClose={() => { setPaying(null); record.reset(); }}
        onSubmit={(input) => {
          if (!paying) return;
          record.mutate(
            { ...input, customer: paying.customer_id },
            {
              onSuccess: (result) => {
                setReceipt({ result, name: paying.name ?? "Customer" });
                setPaying(null);
              },
            }
          );
        }}
      />
      <Dialog open={receipt !== null} onClose={() => setReceipt(null)} title="Payment recorded">
        {receipt && <PaymentReceipt result={receipt.result} customerName={receipt.name} onClose={() => setReceipt(null)} />}
      </Dialog>
    </>
  );
}

function SupplierDebts() {
  const debts = useSupplierDebts();
  const record = useRecordSupplierPayment();
  const confirm = useConfirmPurchaseReview();
  const { show } = useToast();
  const [paying, setPaying] = useState<{ supplier: SupplierDebtRow; purchase: SupplierDebtPurchase } | null>(null);

  if (debts.isError) return <ErrorState message="Couldn't load supplier debts." />;
  if (debts.isLoading || !debts.data) return <p className="text-sm text-text/50">Loading…</p>;

  return (
    <>
      <AgingTotals totals={debts.data.totals} total={debts.data.total} />
      {debts.data.rows.length === 0 && <p className="text-sm text-text/50">The shop owes no supplier anything.</p>}
      <div className="flex flex-col gap-4">
        {debts.data.rows.map((supplier) => (
          <div key={supplier.supplier_id} className={`rounded-md border border-divider p-3 ${supplier.overdue ? "border-red-400" : ""}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-medium">{supplier.name}</span>
              <span className="text-sm text-text/70">RWF {Number(supplier.balance).toLocaleString()}</span>
              {supplier.overdue && <Tag variant="danger">Overdue</Tag>}
              {supplier.needs_review && <Tag variant="warning">Migrated — confirm amount paid</Tag>}
            </div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-text/70 border-b border-divider">
                  <th className="text-left font-medium py-1 px-2">Purchase</th>
                  <th className="text-left font-medium py-1 px-2">Due</th>
                  <th className="text-right font-medium py-1 px-2">Total</th>
                  <th className="text-right font-medium py-1 px-2">Paid</th>
                  <th className="text-right font-medium py-1 px-2">Balance</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {supplier.open_purchases.map((purchase) => (
                  <tr key={purchase.purchase_id} className="border-b border-divider">
                    <td className="py-1 px-2">
                      <Link href={`/purchases/${purchase.purchase_id}`} className="underline">#P-{purchase.purchase_id}</Link>
                      {purchase.invoice_number ? ` · ${purchase.invoice_number}` : ""}
                    </td>
                    <td className="py-1 px-2">{formatDate(purchase.due_date)}</td>
                    <td className="py-1 px-2 text-right">{Number(purchase.total).toLocaleString()}</td>
                    <td className="py-1 px-2 text-right">{Number(purchase.amount_paid).toLocaleString()}</td>
                    <td className="py-1 px-2 text-right">{Number(purchase.balance).toLocaleString()}</td>
                    <td className="py-1 px-2 text-right whitespace-nowrap">
                      {Number(purchase.balance) > 0 && (
                        <Button variant="ghost" className="text-xs" onClick={() => setPaying({ supplier, purchase })}>
                          Record payment
                        </Button>
                      )}
                      {purchase.needs_review && (
                        <Button
                          variant="ghost"
                          className="text-xs"
                          onClick={() =>
                            confirm.mutate(purchase.purchase_id, {
                              onSuccess: () => show("Marked as checked.", "success"),
                              onError: (e) => show(messageOf(e), "error"),
                            })
                          }
                        >
                          Confirm as recorded
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <RecordPaymentDialog
        open={paying !== null}
        title="Record supplier payment"
        subject={paying ? `${paying.supplier.name} · #P-${paying.purchase.purchase_id}` : ""}
        maxAmount={Number(paying?.purchase.balance ?? 0)}
        submitting={record.isPending}
        error={record.error ? messageOf(record.error) : null}
        onClose={() => { setPaying(null); record.reset(); }}
        onSubmit={(input) => {
          if (!paying) return;
          record.mutate(
            { ...input, purchase: paying.purchase.purchase_id },
            {
              onSuccess: () => {
                show("Supplier payment recorded.", "success");
                setPaying(null);
              },
            }
          );
        }}
      />
    </>
  );
}
