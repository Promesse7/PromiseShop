"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError, extractErrorMessage } from "@/lib/api-client";
import {
  useCustomerOpenSales, useCustomerStatement, usePayments, useRecordCustomerPayment, useReversePayment,
} from "@/lib/finance/useDebts";
import { PAYMENT_METHOD_LABELS } from "@/lib/pos/payments";
import { RecordPaymentDialog } from "@/components/finance/RecordPaymentDialog";
import { PaymentReceipt } from "@/components/finance/PaymentReceipt";
import { useToast } from "@/components/layout/ToastProvider";
import { Card, CardKicker } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tag } from "@/components/ui/Tag";
import type { Customer, CustomerPaymentResult } from "@/lib/types";

interface CustomerDetailPageClientProps {
  customerId: number;
  canManage: boolean;
}

function money(value: string | number | null | undefined) {
  return `RWF ${Number(value ?? 0).toLocaleString()}`;
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function messageOf(error: unknown) {
  return error instanceof ApiError ? extractErrorMessage(error.body) : "Something went wrong — try again.";
}

export default function CustomerDetailPageClient({ customerId, canManage }: CustomerDetailPageClientProps) {
  const queryClient = useQueryClient();
  const { show } = useToast();
  const customer = useQuery({
    queryKey: ["customers", customerId],
    queryFn: () => apiFetch<Customer>(`customers/${customerId}/`),
  });
  const openSales = useCustomerOpenSales(customerId);
  const payments = usePayments({ customer: customerId });
  const record = useRecordCustomerPayment();
  const reverse = useReversePayment();
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState<CustomerPaymentResult | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const statement = useCustomerStatement(customerId, from, to);
  const [limit, setLimit] = useState<string | null>(null);

  if (customer.isError) return <ErrorState message="Couldn't load this customer." />;
  if (customer.isLoading || !customer.data) return <p className="text-sm text-text/50">Loading…</p>;

  const c = customer.data;
  const balance = Number(c.balance ?? 0);

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

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={c.name ?? "Customer"}>
        <span className="text-sm text-text/60 ml-3">{c.phone ?? "no phone"}</span>
        <Button className="ml-auto" disabled={balance <= 0} onClick={() => setPaying(true)}>
          Record payment
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card elevation="sm">
          <CardKicker>Balance owed</CardKicker>
          <div className={`font-sans font-medium text-xl ${balance > 0 ? "text-amber-500" : ""}`}>{money(balance)}</div>
        </Card>
        <Card elevation="sm">
          <CardKicker>Credit limit</CardKicker>
          {limit === null ? (
            <div className="flex items-center gap-2">
              <span>{c.credit_limit ? money(c.credit_limit) : "No limit"}</span>
              {canManage && (
                <Button variant="ghost" className="text-xs" onClick={() => setLimit(c.credit_limit ?? "")}>
                  Change
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <Field label="Limit (blank = none)" name="credit_limit" type="number" value={limit} onChange={setLimit} />
              <Button onClick={saveLimit}>Save</Button>
            </div>
          )}
        </Card>
        <Card elevation="sm">
          <CardKicker>Contact</CardKicker>
          <span className="text-sm">{c.email ?? "—"}</span>
          <span className="text-sm text-text/60">{c.address ?? ""}</span>
        </Card>
      </div>

      <Card elevation="sm">
        <CardKicker>Open sales</CardKicker>
        {(openSales.data ?? []).length === 0 ? (
          <p className="text-sm text-text/50">Nothing owed.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-text/70 border-b border-divider">
                <th className="text-left font-medium py-1 px-2">Sale</th>
                <th className="text-left font-medium py-1 px-2">Date</th>
                <th className="text-left font-medium py-1 px-2">Due</th>
                <th className="text-right font-medium py-1 px-2">Total</th>
                <th className="text-right font-medium py-1 px-2">Paid</th>
                <th className="text-right font-medium py-1 px-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              {(openSales.data ?? []).map((sale) => {
                const overdue = sale.due_date ? new Date(sale.due_date) < new Date() : false;
                return (
                  <tr key={sale.sale_id} className="border-b border-divider">
                    <td className="py-1 px-2">#S-{sale.sale_id}</td>
                    <td className="py-1 px-2">{shortDate(sale.sale_date)}</td>
                    <td className="py-1 px-2">
                      {sale.due_date ? shortDate(sale.due_date) : "—"} {overdue && <Tag variant="danger">Overdue</Tag>}
                    </td>
                    <td className="py-1 px-2 text-right">{Number(sale.total_amount).toLocaleString()}</td>
                    <td className="py-1 px-2 text-right">{Number(sale.amount_paid ?? 0).toLocaleString()}</td>
                    <td className="py-1 px-2 text-right">{Number(sale.balance ?? 0).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card elevation="sm">
        <CardKicker>Payment history</CardKicker>
        {(payments.data ?? []).length === 0 ? (
          <p className="text-sm text-text/50">No payments yet.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <tbody>
              {(payments.data ?? []).map((p) => (
                <tr key={p.payment_id} className="border-b border-divider">
                  <td className="py-1 px-2">{shortDate(p.paid_at)}</td>
                  <td className="py-1 px-2">Sale #S-{p.sale}</td>
                  <td className="py-1 px-2">
                    {PAYMENT_METHOD_LABELS[p.method]}
                    {p.reference ? ` · ${p.reference}` : ""}
                    {p.reversal_of && <Tag variant="warning" className="ml-1">Reversal</Tag>}
                    {p.is_reversed && <Tag variant="neutral" className="ml-1">Reversed</Tag>}
                  </td>
                  <td className="py-1 px-2 text-right">{Number(p.amount).toLocaleString()}</td>
                  <td className="py-1 px-2 text-right">
                    {canManage && !p.reversal_of && !p.is_reversed && (
                      <Button
                        variant="ghost"
                        className="text-xs"
                        onClick={() => {
                          const reason = window.prompt("Why is this payment being reversed?");
                          if (!reason) return;
                          reverse.mutate(
                            { paymentId: p.payment_id, reason },
                            {
                              onSuccess: () => show("Payment reversed.", "success"),
                              onError: (e) => show(messageOf(e), "error"),
                            }
                          );
                        }}
                      >
                        Reverse
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card elevation="sm" className="print-target">
        <div className="flex items-end gap-3 flex-wrap print:hidden">
          <CardKicker>Statement</CardKicker>
          <Field label="From" name="from" type="date" value={from} onChange={setFrom} />
          <Field label="To" name="to" type="date" value={to} onChange={setTo} />
          <Button variant="secondary" onClick={() => window.print()}>Print statement</Button>
        </div>
        <div className="hidden print:block font-medium">Statement — {c.name} {c.phone ? `(${c.phone})` : ""}</div>
        {statement.data && (
          <table className="w-full text-sm border-collapse mt-2">
            <thead>
              <tr className="text-text/70 border-b border-divider">
                <th className="text-left font-medium py-1 px-2">Date</th>
                <th className="text-left font-medium py-1 px-2">Entry</th>
                <th className="text-right font-medium py-1 px-2">Charged</th>
                <th className="text-right font-medium py-1 px-2">Paid</th>
                <th className="text-right font-medium py-1 px-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-divider">
                <td className="py-1 px-2" colSpan={4}>Opening balance</td>
                <td className="py-1 px-2 text-right">{Number(statement.data.opening_balance).toLocaleString()}</td>
              </tr>
              {statement.data.entries.map((entry, i) => (
                <tr key={`${entry.reference}-${i}`} className="border-b border-divider">
                  <td className="py-1 px-2">{shortDate(entry.date)}</td>
                  <td className="py-1 px-2">{entry.reference}</td>
                  <td className="py-1 px-2 text-right">{Number(entry.debit) ? Number(entry.debit).toLocaleString() : ""}</td>
                  <td className="py-1 px-2 text-right">{Number(entry.credit) ? Number(entry.credit).toLocaleString() : ""}</td>
                  <td className="py-1 px-2 text-right">{Number(entry.balance).toLocaleString()}</td>
                </tr>
              ))}
              <tr>
                <td className="py-1 px-2 font-medium" colSpan={4}>Closing balance</td>
                <td className="py-1 px-2 text-right font-medium">{Number(statement.data.closing_balance).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>

      <p className="text-xs text-text/50"><Link href="/customers" className="underline">← All customers</Link></p>

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
    </div>
  );
}
