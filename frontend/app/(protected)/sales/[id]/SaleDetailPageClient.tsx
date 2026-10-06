"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError, extractErrorMessage } from "@/lib/api-client";
import { useReturnSaleItems, useSale, useVoidSale } from "@/lib/sales/useSalesHistory";
import { PAYMENT_METHOD_LABELS } from "@/lib/pos/payments";
import { Receipt } from "@/components/pos/Receipt";
import { ReturnItemsDialog } from "@/components/sales/ReturnItemsDialog";
import { SaleStatusTag } from "@/components/sales/SaleStatusTag";
import { VoidSaleDialog } from "@/components/sales/VoidSaleDialog";
import { useToast } from "@/components/layout/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardKicker } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tag } from "@/components/ui/Tag";

interface SaleDetailPageClientProps {
  saleId: number;
  // Admin and manager: list vs sold price and cost are shown, and they may void or return.
  canManage: boolean;
}

function money(value: string | number | null | undefined) {
  return `RWF ${Number(value ?? 0).toLocaleString()}`;
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function messageOf(error: unknown) {
  return error instanceof ApiError ? extractErrorMessage(error.body) : "Something went wrong — try again.";
}

const MOVEMENT_LABELS: Record<string, string> = {
  sale: "Sold", sale_void: "Voided", sale_return: "Returned",
};

export default function SaleDetailPageClient({ saleId, canManage }: SaleDetailPageClientProps) {
  const { show } = useToast();
  const sale = useSale(saleId);
  const voidSale = useVoidSale(saleId);
  const returnItems = useReturnSaleItems(saleId);
  const [dialog, setDialog] = useState<"void" | "return" | "receipt" | null>(null);

  if (sale.isError) return <ErrorState message="Couldn't load this sale — it may not be one you can see." />;
  if (sale.isLoading || !sale.data) return <p className="text-sm text-text/50">Loading…</p>;

  const s = sale.data;
  const canReturn = canManage && (s.status === "completed" || s.status === "partially_returned");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={`Sale #S-${s.sale_id}`} subtitle={when(s.sale_date)}>
        <SaleStatusTag status={s.status} />
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={() => setDialog("receipt")}>Reprint receipt</Button>
          {canReturn && <Button variant="secondary" onClick={() => setDialog("return")}>Return items</Button>}
          {canManage && s.can_void && <Button onClick={() => setDialog("void")}>Void</Button>}
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card elevation="sm">
          <CardKicker>Summary</CardKicker>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-text/60">Cashier</dt><dd>{s.employee_name ?? `#${s.employee}`}</dd>
            <dt className="text-text/60">Customer</dt>
            <dd>
              {s.customer ? (
                <Link href={`/customers/${s.customer}`} className="text-accent hover:underline">{s.customer_name}</Link>
              ) : "Walk-in"}
            </dd>
            <dt className="text-text/60">Total</dt><dd>{money(s.total_amount)}</dd>
            {Number(s.returned_amount ?? 0) > 0 && (<><dt className="text-text/60">Returned</dt><dd>− {money(s.returned_amount)}</dd></>)}
            <dt className="text-text/60">Paid</dt><dd>{money(s.amount_paid)}</dd>
            {s.status !== "voided" && Number(s.balance ?? 0) > 0 && (
              <><dt className="text-text/60">Balance</dt><dd className="font-medium">{money(s.balance)}{s.due_date ? ` · due ${s.due_date}` : ""}</dd></>
            )}
          </dl>
          {s.status === "voided" && (
            <p className="text-sm text-red-700 mt-2">
              Voided {s.voided_at ? when(s.voided_at) : ""} by {s.voided_by_name ?? "—"}: {s.void_reason}
            </p>
          )}
        </Card>

        <Card elevation="sm">
          <CardKicker>Payments</CardKicker>
          {(s.payments ?? []).length === 0 ? (
            <p className="text-sm text-text/50">No payments</p>
          ) : (
            <ul className="text-sm flex flex-col gap-1">
              {(s.payments ?? []).map((p) => (
                <li key={p.payment_id} className="flex justify-between gap-2">
                  <span>
                    {when(p.paid_at)} · {PAYMENT_METHOD_LABELS[p.method]}
                    {p.reference ? ` · ${p.reference}` : ""}
                    {p.direction === "out" && Number(p.amount) > 0 && <Tag variant="neutral" className="ml-1">Refund</Tag>}
                    {p.reversal_of && <Tag variant="danger" className="ml-1">Reversal</Tag>}
                  </span>
                  <span>{p.direction === "out" ? "−" : ""}{Number(p.amount).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card elevation="sm">
        <CardKicker>Items</CardKicker>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-divider text-left text-text/70">
              <th className="py-1.5 font-medium">Product</th>
              <th className="py-1.5 font-medium">Qty</th>
              {canManage && <th className="py-1.5 font-medium">Catalog</th>}
              <th className="py-1.5 font-medium">Sold at</th>
              <th className="py-1.5 font-medium">Subtotal</th>
              {canManage && <th className="py-1.5 font-medium">Cost</th>}
            </tr>
          </thead>
          <tbody>
            {s.items.map((item) => (
              <tr key={item.sale_item_id} className="border-b border-divider">
                <td className="py-1.5">
                  <Link href={`/products/${item.product}`} className="hover:underline">{item.product_name ?? `#${item.product}`}</Link>
                  {item.price_note && <div className="text-xs text-text/50">{item.price_note}</div>}
                  {item.approved_by_name && <div className="text-xs text-text/50">Approved by {item.approved_by_name}</div>}
                </td>
                <td className="py-1.5">{item.quantity}</td>
                {canManage && <td className="py-1.5">{Number(item.list_price).toLocaleString()}</td>}
                <td className="py-1.5">{Number(item.unit_price).toLocaleString()}</td>
                <td className="py-1.5">{Number(item.subtotal).toLocaleString()}</td>
                {canManage && <td className="py-1.5">{item.cost_at_sale ? Number(item.cost_at_sale).toLocaleString() : "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {(s.returns ?? []).length > 0 && (
        <Card elevation="sm">
          <CardKicker>Returns</CardKicker>
          <ul className="text-sm flex flex-col gap-2">
            {(s.returns ?? []).map((r) => (
              <li key={r.return_id}>
                <div className="flex justify-between">
                  <span>Return #{r.return_id} · {when(r.created_at)} · {r.created_by_name}</span>
                  <span>{money(r.refund_total)}</span>
                </div>
                <div className="text-xs text-text/60">
                  {r.items.map((i) => `${i.product_name} × ${i.quantity} (${i.condition})`).join(", ")} — {r.reason}
                </div>
                <div className="text-xs text-text/60">
                  Paid back {money(r.paid_out)}
                  {r.refund_method !== "balance" ? ` by ${PAYMENT_METHOD_LABELS[r.refund_method]}` : ""}
                  {Number(r.balance_reduced) > 0 ? ` · reduced the balance by ${money(r.balance_reduced)}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card elevation="sm">
        <CardKicker>Stock movements</CardKicker>
        {(s.movements ?? []).length === 0 ? (
          <p className="text-sm text-text/50">No movements</p>
        ) : (
          <ul className="text-sm flex flex-col gap-1">
            {(s.movements ?? []).map((m) => (
              <li key={m.movement_id} className="flex justify-between gap-2">
                <span>
                  {when(m.created_at)} · {MOVEMENT_LABELS[m.movement_type] ?? m.movement_type} · {m.product_name}
                  {m.bucket !== "in_stock" ? ` (${m.bucket.replace("_", " ")})` : ""}
                </span>
                <span>{m.quantity_delta > 0 ? "+" : ""}{m.quantity_delta} → {m.balance_after}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={dialog === "receipt"} onClose={() => setDialog(null)} title={`Receipt #S-${s.sale_id}`}>
        {dialog === "receipt" && (
          <Receipt sale={s} lines={[]} servedBy={s.employee_name ?? ""} onPrint={() => window.print()} reprint />
        )}
      </Dialog>
      <VoidSaleDialog
        open={dialog === "void"}
        sale={s}
        submitting={voidSale.isPending}
        error={voidSale.error ? messageOf(voidSale.error) : null}
        onClose={() => { voidSale.reset(); setDialog(null); }}
        onSubmit={(reason) =>
          voidSale.mutate(reason, {
            onSuccess: () => { setDialog(null); show(`Sale #S-${s.sale_id} voided.`, "success"); },
          })
        }
      />
      <ReturnItemsDialog
        open={dialog === "return"}
        sale={s}
        submitting={returnItems.isPending}
        error={returnItems.error ? messageOf(returnItems.error) : null}
        onClose={() => { returnItems.reset(); setDialog(null); }}
        onSubmit={(input) =>
          returnItems.mutate(input, {
            onSuccess: () => { setDialog(null); show("Return recorded — stock updated.", "success"); },
          })
        }
      />
    </div>
  );
}
