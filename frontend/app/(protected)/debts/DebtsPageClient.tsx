"use client";

import { useState } from "react";
import Link from "next/link";
import { Page } from "@/components/ui/Page";
import { Tabs } from "@/components/ui/Tabs";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { AgingTotals } from "@/components/finance/AgingTotals";
import { RecordPaymentDialog } from "@/components/finance/RecordPaymentDialog";
import { PaymentReceipt } from "@/components/finance/PaymentReceipt";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/layout/ToastProvider";
import { ApiError, extractErrorMessage } from "@/lib/api-client";
import { formatRwf } from "@/lib/format";
import {
  useConfirmPurchaseReview, useCustomerDebts, useRecordCustomerPayment, useRecordSupplierPayment, useSupplierDebts,
} from "@/lib/finance/useDebts";
import type { CustomerDebtRow, CustomerPaymentResult, SupplierDebtPurchase, SupplierDebtRow } from "@/lib/types";
import { HandCoins } from "lucide-react";

interface DebtsPageClientProps {
  canView: boolean;
}

type DebtsTab = "customers" | "suppliers";

const TABS = [
  { id: "customers", label: "Customers owe us" },
  { id: "suppliers", label: "We owe suppliers" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function messageOf(error: unknown) {
  return error instanceof ApiError ? extractErrorMessage(error.body) : "Something went wrong — try again.";
}

export default function DebtsPageClient({ canView }: DebtsPageClientProps) {
  const [tab, setTab] = useState<DebtsTab>("customers");

  if (!canView) {
    return (
      <Page title="Debts">
        <p className="text-sm text-text/70">
          This screen is limited to Admin and Manager accounts. Record a customer&apos;s payment from their customer page.
        </p>
      </Page>
    );
  }

  return (
    <Page title="Debts" description="Who owes the shop, and who the shop owes — oldest first.">
      <Tabs tabs={TABS} value={tab} onChange={(id) => setTab(id as DebtsTab)} label="Debts">
        {(active) => (active === "customers" ? <CustomerDebts /> : <SupplierDebts />)}
      </Tabs>
    </Page>
  );
}

function CustomerDebts() {
  const debts = useCustomerDebts();
  const record = useRecordCustomerPayment();
  const [paying, setPaying] = useState<CustomerDebtRow | null>(null);
  const [receipt, setReceipt] = useState<{ result: CustomerPaymentResult; name: string } | null>(null);

  if (debts.isError) return <ErrorState message="Couldn't load customer debts." onRetry={() => debts.refetch()} />;
  if (debts.isLoading || !debts.data) return <LoadingState variant="table" />;

  const columns: DataColumn<CustomerDebtRow>[] = [
    {
      key: "name",
      header: "Customer",
      primary: true,
      sortValue: (row) => row.name ?? "",
      render: (row) => (
        <Link href={`/customers/${row.customer_id}`} className="font-medium text-text hover:text-accent">
          {row.name ?? "—"}
        </Link>
      ),
    },
    { key: "phone", header: "Phone", render: (row) => row.phone ?? "—" },
    { key: "open_sales", header: "Open sales", align: "right", sortValue: (row) => row.open_sales },
    { key: "balance", header: "Balance", money: true, mobile: true, sortValue: (row) => Number(row.balance) },
    {
      key: "oldest_due_date",
      header: "Oldest due",
      mobile: true,
      sortValue: (row) => row.oldest_due_date,
      render: (row) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {formatDate(row.oldest_due_date)}
          {row.overdue && <Tag variant="danger">Overdue</Tag>}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      mobile: true,
      render: (row) => (
        <Button variant="ghost" className="text-xs" onClick={() => setPaying(row)}>
          Record payment
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <AgingTotals totals={debts.data.totals} total={debts.data.total} />
      <DataTable
        label="Customers who owe the shop"
        columns={columns}
        rows={debts.data.rows}
        rowKey={(row) => String(row.customer_id)}
        defaultSort={{ key: "oldest_due_date", dir: "asc" }}
        empty={<EmptyState icon={HandCoins} title="No customer owes the shop anything." />}
      />
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
    </div>
  );
}

function SupplierDebts() {
  const debts = useSupplierDebts();
  const record = useRecordSupplierPayment();
  const confirm = useConfirmPurchaseReview();
  const { show } = useToast();
  const [paying, setPaying] = useState<{ supplier: SupplierDebtRow; purchase: SupplierDebtPurchase } | null>(null);

  if (debts.isError) return <ErrorState message="Couldn't load supplier debts." onRetry={() => debts.refetch()} />;
  if (debts.isLoading || !debts.data) return <LoadingState variant="table" />;

  function columnsFor(supplier: SupplierDebtRow): DataColumn<SupplierDebtPurchase>[] {
    return [
      {
        key: "purchase",
        header: "Purchase",
        primary: true,
        render: (purchase) => (
          <span>
            <Link href={`/purchases/${purchase.purchase_id}`} className="font-medium text-text hover:text-accent">
              #P-{purchase.purchase_id}
            </Link>
            {purchase.invoice_number ? <span className="text-text/60"> · {purchase.invoice_number}</span> : null}
          </span>
        ),
      },
      { key: "due_date", header: "Due", mobile: true, render: (purchase) => formatDate(purchase.due_date) },
      { key: "total", header: "Total", money: true },
      { key: "amount_paid", header: "Paid", money: true },
      { key: "balance", header: "Balance", money: true, mobile: true },
      {
        key: "actions",
        header: "",
        align: "right",
        mobile: true,
        render: (purchase) => (
          <span className="inline-flex flex-wrap justify-end gap-1">
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
          </span>
        ),
      },
    ];
  }

  return (
    <div className="flex flex-col gap-4">
      <AgingTotals totals={debts.data.totals} total={debts.data.total} />
      {debts.data.rows.length === 0 && <EmptyState icon={HandCoins} title="The shop owes no supplier anything." />}
      {debts.data.rows.map((supplier) => (
        <section
          key={supplier.supplier_id}
          aria-label={supplier.name}
          className={`flex flex-col gap-2 rounded-lg border p-3 ${supplier.overdue ? "border-red-400/60" : "border-divider"}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{supplier.name}</span>
            <span className="text-sm tabular-nums text-text/70">{formatRwf(supplier.balance)}</span>
            {supplier.overdue && <Tag variant="danger">Overdue</Tag>}
            {supplier.needs_review && <Tag variant="warning">Migrated — confirm amount paid</Tag>}
          </div>
          <DataTable
            label={`Open purchases from ${supplier.name}`}
            columns={columnsFor(supplier)}
            rows={supplier.open_purchases}
            rowKey={(purchase) => String(purchase.purchase_id)}
          />
        </section>
      ))}
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
    </div>
  );
}
