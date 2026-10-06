"use client";

import { sharedName } from "@/components/ui/SharedElement";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SearchX } from "lucide-react";
import { apiFetch, ApiError, extractErrorMessage } from "@/lib/api-client";
import { formatRwf } from "@/lib/format";
import {
  useCustomerOpenSales, useCustomerStatement, usePayments, useRecordCustomerPayment, useReversePayment,
} from "@/lib/finance/useDebts";
import { PAYMENT_METHOD_LABELS } from "@/lib/pos/payments";
import { RecordPaymentDialog } from "@/components/finance/RecordPaymentDialog";
import { PaymentReceipt } from "@/components/finance/PaymentReceipt";
import { StatStrip } from "@/components/finance/StatStrip";
import { useToast } from "@/components/layout/ToastProvider";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field } from "@/components/ui/Field";
import { LoadingState } from "@/components/ui/LoadingState";
import { Page } from "@/components/ui/Page";
import { Tabs } from "@/components/ui/Tabs";
import { Tag } from "@/components/ui/Tag";
import type { Customer, CustomerPaymentResult, Payment, Sale } from "@/lib/types";

interface CustomerDetailPageClientProps {
  customerId: number;
  canManage: boolean;
}

type CustomerTab = "overview" | "sales" | "payments" | "statement";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function messageOf(error: unknown) {
  return error instanceof ApiError ? extractErrorMessage(error.body) : "Something went wrong — try again.";
}

export default function CustomerDetailPageClient({ customerId, canManage }: CustomerDetailPageClientProps) {
  const queryClient = useQueryClient();
  const { show } = useToast();
  const confirm = useConfirm();
  const customer = useQuery({
    queryKey: ["customers", customerId],
    queryFn: () => apiFetch<Customer>(`customers/${customerId}/`),
  });
  const openSales = useCustomerOpenSales(customerId);
  const payments = usePayments({ customer: customerId });
  const record = useRecordCustomerPayment();
  const reverse = useReversePayment();
  const [tab, setTab] = useState<CustomerTab>("overview");
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState<CustomerPaymentResult | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const statement = useCustomerStatement(customerId, from, to);
  const [limit, setLimit] = useState<string | null>(null);

  if (customer.error instanceof ApiError && customer.error.status === 404) {
    return (
      <Page title="Customer not found" back="/customers">
        <EmptyState
          icon={SearchX}
          title="This customer doesn't exist"
          action={<Button href="/customers">Back to customers</Button>}
        />
      </Page>
    );
  }
  if (customer.isError) {
    return (
      <Page title="Customer" back="/customers">
        <ErrorState message="Couldn't load this customer." onRetry={() => customer.refetch()} />
      </Page>
    );
  }
  if (customer.isLoading || !customer.data) {
    return (
      <Page title="Loading customer…" back="/customers">
        <LoadingState variant="detail" />
      </Page>
    );
  }

  const c = customer.data;
  const balance = Number(c.balance ?? 0);
  const sales = openSales.data ?? [];
  const paymentRows = payments.data ?? [];

  async function saveLimit() {
    try {
      await apiFetch(`customers/${customerId}/`, {
        method: "PATCH",
        body: JSON.stringify({ credit_limit: limit === "" ? null : Number(limit).toFixed(2) }),
      });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setLimit(null);
      show("Credit limit saved.", "success");
    } catch (error) {
      show(messageOf(error), "error");
    }
  }

  async function handleReverse(p: Payment) {
    const reason = await confirm({
      title: "Reverse this payment?",
      message: `${formatRwf(p.amount)} on ${shortDate(p.paid_at)} goes back onto ${c.name ?? "the customer"}'s balance.`,
      confirmLabel: "Reverse payment",
      tone: "danger",
      input: { label: "Reason", required: true, placeholder: "Why is this payment being reversed?" },
    });
    if (typeof reason !== "string" || !reason.trim()) return;
    reverse.mutate(
      { paymentId: p.payment_id, reason: reason.trim() },
      {
        onSuccess: () => show("Payment reversed.", "success"),
        onError: (e) => show(messageOf(e), "error"),
      }
    );
  }

  const saleColumns: DataColumn<Sale>[] = [
    { key: "sale", header: "Sale", primary: true, render: (sale) => <span className="font-mono">#S-{sale.sale_id}</span> },
    { key: "date", header: "Date", render: (sale) => shortDate(sale.sale_date) },
    {
      key: "due",
      header: "Due",
      mobile: true,
      render: (sale) => {
        const overdue = sale.due_date ? new Date(sale.due_date) < new Date() : false;
        return (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {sale.due_date ? shortDate(sale.due_date) : "—"}
            {overdue && <Tag variant="danger">Overdue</Tag>}
          </span>
        );
      },
    },
    { key: "total_amount", header: "Total", money: true },
    { key: "amount_paid", header: "Paid", money: true },
    { key: "balance", header: "Balance", money: true, mobile: true },
  ];

  return (
    <Page
      title={c.name ?? "Customer"}
      sharedName={sharedName("customer", c.customer_id)}
      description={c.phone ?? "No phone on file"}
      back="/customers"
      primaryAction={
        <Button disabled={balance <= 0} onClick={() => setPaying(true)}>
          Record payment
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <StatStrip
          label="Customer summary"
          stats={[
            { label: "Balance owed", amount: balance, tone: balance > 0 ? "danger" : "success" },
            { label: "Credit limit", value: c.credit_limit ? formatRwf(c.credit_limit) : "No limit" },
            { label: "Open sales", value: openSales.isLoading ? "…" : sales.length },
          ]}
        />

        <Tabs
          label="Customer sections"
          value={tab}
          onChange={(id) => setTab(id as CustomerTab)}
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "sales", label: "Sales", count: sales.length },
            { id: "payments", label: "Payments", count: paymentRows.length },
            { id: "statement", label: "Statement" },
          ]}
        >
          {(active) => {
            if (active === "overview") {
              return (
                <dl className="m-0 grid max-w-xl grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-text/60">Phone</dt>
                  <dd className="m-0">{c.phone ?? "—"}</dd>
                  <dt className="text-text/60">Email</dt>
                  <dd className="m-0">{c.email ?? "—"}</dd>
                  <dt className="text-text/60">Address</dt>
                  <dd className="m-0">{c.address ?? "—"}</dd>
                  <dt className="self-center text-text/60">Credit limit</dt>
                  <dd className="m-0">
                    {limit === null ? (
                      <span className="inline-flex items-center gap-2">
                        {c.credit_limit ? formatRwf(c.credit_limit) : "No limit"}
                        {canManage && (
                          <Button variant="ghost" className="text-xs" onClick={() => setLimit(c.credit_limit ?? "")}>
                            Change
                          </Button>
                        )}
                      </span>
                    ) : (
                      <span className="flex flex-wrap items-end gap-2">
                        <Field label="Limit (blank = none)" name="credit_limit" type="number" value={limit} onChange={setLimit} />
                        <Button onClick={saveLimit}>Save</Button>
                        <Button variant="secondary" onClick={() => setLimit(null)}>Cancel</Button>
                      </span>
                    )}
                  </dd>
                </dl>
              );
            }
            if (active === "sales") {
              return openSales.isLoading ? (
                <LoadingState variant="table" rows={3} />
              ) : (
                <DataTable
                  label="Open sales"
                  columns={saleColumns}
                  rows={sales}
                  rowKey={(sale) => String(sale.sale_id)}
                  rowHref={(sale) => `/sales/${sale.sale_id}`}
                  empty={<EmptyState title="Nothing owed." />}
                />
              );
            }
            if (active === "payments") {
              return paymentRows.length === 0 ? (
                <EmptyState title="No payments yet." />
              ) : (
                <ul className="m-0 flex list-none flex-col divide-y divide-divider rounded-lg border border-divider bg-surface p-0 text-sm">
                  {paymentRows.map((p) => (
                    <li key={p.payment_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                      <span>
                        {shortDate(p.paid_at)} · Sale #S-{p.sale} · {PAYMENT_METHOD_LABELS[p.method]}
                        {p.reference ? ` · ${p.reference}` : ""}
                        {p.reversal_of && <Tag variant="warning" className="ml-1">Reversal</Tag>}
                        {p.is_reversed && <Tag variant="neutral" className="ml-1">Reversed</Tag>}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="tabular-nums">{formatRwf(p.amount)}</span>
                        {canManage && !p.reversal_of && !p.is_reversed && (
                          <Button variant="ghost" className="text-xs" onClick={() => handleReverse(p)}>
                            Reverse
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              );
            }
            return (
              <div className="print-target flex flex-col gap-2">
                <div className="flex flex-wrap items-end gap-3 print:hidden">
                  <Field label="From" name="from" type="date" value={from} onChange={setFrom} />
                  <Field label="To" name="to" type="date" value={to} onChange={setTo} />
                  <Button variant="secondary" onClick={() => window.print()}>Print statement</Button>
                </div>
                <div className="hidden font-medium print:block">
                  Statement — {c.name} {c.phone ? `(${c.phone})` : ""}
                </div>
                {statement.isLoading && <LoadingState variant="table" rows={4} />}
                {statement.data && (
                  <div className="overflow-x-auto rounded-lg border border-divider bg-surface">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-divider text-text/70">
                          <th className="px-3 py-2 text-left font-medium">Date</th>
                          <th className="px-3 py-2 text-left font-medium">Entry</th>
                          <th className="px-3 py-2 text-right font-medium">Charged</th>
                          <th className="px-3 py-2 text-right font-medium">Paid</th>
                          <th className="px-3 py-2 text-right font-medium">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="tabular-nums">
                        <tr className="border-b border-divider">
                          <td className="px-3 py-2" colSpan={4}>Opening balance</td>
                          <td className="px-3 py-2 text-right">{formatRwf(statement.data.opening_balance)}</td>
                        </tr>
                        {statement.data.entries.map((entry, i) => (
                          <tr key={`${entry.reference}-${i}`} className="border-b border-divider">
                            <td className="px-3 py-2">{shortDate(entry.date)}</td>
                            <td className="px-3 py-2">{entry.reference}</td>
                            <td className="px-3 py-2 text-right">{Number(entry.debit) ? formatRwf(entry.debit) : ""}</td>
                            <td className="px-3 py-2 text-right">{Number(entry.credit) ? formatRwf(entry.credit) : ""}</td>
                            <td className="px-3 py-2 text-right">{formatRwf(entry.balance)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td className="px-3 py-2 font-medium" colSpan={4}>Closing balance</td>
                          <td className="px-3 py-2 text-right font-medium">{formatRwf(statement.data.closing_balance)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          }}
        </Tabs>
      </div>

      <RecordPaymentDialog
        open={paying}
        title="Record customer payment"
        subject={c.name ?? "Customer"}
        maxAmount={balance}
        submitting={record.isPending}
        error={record.error ? messageOf(record.error) : null}
        onClose={() => { setPaying(false); record.reset(); }}
        onSubmit={(input) =>
          record.mutate(
            { ...input, customer: customerId },
            { onSuccess: (result) => { setPaying(false); setReceipt(result); } }
          )
        }
      />
      <Dialog open={receipt !== null} onClose={() => setReceipt(null)} title="Payment recorded">
        {receipt && <PaymentReceipt result={receipt} customerName={c.name ?? "Customer"} onClose={() => setReceipt(null)} />}
      </Dialog>
    </Page>
  );
}
