"use client";

import { sharedName } from "@/components/ui/SharedElement";
import { useState } from "react";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { ApiError, extractErrorMessage } from "@/lib/api-client";
import { formatRwf } from "@/lib/format";
import { useReturnSaleItems, useSale, useVoidSale } from "@/lib/sales/useSalesHistory";
import { PAYMENT_METHOD_LABELS } from "@/lib/pos/payments";
import { Receipt } from "@/components/pos/Receipt";
import { ReturnItemsDialog } from "@/components/sales/ReturnItemsDialog";
import { SaleStatusTag } from "@/components/sales/SaleStatusTag";
import { StatStrip, type Stat } from "@/components/ui/StatStrip";
import { useToast } from "@/components/layout/ToastProvider";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Page } from "@/components/ui/Page";
import { Tabs } from "@/components/ui/Tabs";
import { Tag } from "@/components/ui/Tag";
import type { Sale, SaleItem } from "@/lib/types";

interface SaleDetailPageClientProps {
  saleId: number;
  // Admin and manager: list vs sold price and cost are shown, and they may void or return.
  canManage: boolean;
}

type SaleTab = "lines" | "payments" | "returns" | "movements";

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

function NotFound({ saleId }: { saleId: number }) {
  return (
    <Page title="Sale not found" back="/sales">
      <EmptyState
        icon={SearchX}
        title={`Sale #S-${saleId} not found`}
        message="It may have been typed wrong, or it isn't one your account can see."
        action={<Button href="/sales">Back to sales</Button>}
      />
    </Page>
  );
}

export default function SaleDetailPageClient({ saleId, canManage }: SaleDetailPageClientProps) {
  const { show } = useToast();
  const confirm = useConfirm();
  const validId = Number.isInteger(saleId) && saleId > 0;
  const sale = useSale(saleId);
  const voidSale = useVoidSale(saleId);
  const returnItems = useReturnSaleItems(saleId);
  const [dialog, setDialog] = useState<"return" | "receipt" | null>(null);
  const [tab, setTab] = useState<SaleTab>("lines");

  // The jump search links straight to /sales/<id>; an unknown or hidden sale is a 404.
  if (!validId || (sale.error instanceof ApiError && sale.error.status === 404)) return <NotFound saleId={saleId} />;
  if (sale.isError) {
    return (
      <Page title={`Sale #S-${saleId}`} back="/sales">
        <ErrorState message="Couldn't load this sale — it may not be one you can see." onRetry={() => sale.refetch()} />
      </Page>
    );
  }
  if (sale.isLoading || !sale.data) {
    return (
      <Page title="Loading sale…" back="/sales">
        <LoadingState variant="detail" />
      </Page>
    );
  }

  const s = sale.data;
  const canReturn = canManage && (s.status === "completed" || s.status === "partially_returned");
  const balance = Number(s.balance ?? 0);
  const returnsCount = (s.returns ?? []).length;

  async function handleVoid(current: Sale) {
    const reason = await confirm({
      title: `Void sale #S-${current.sale_id}`,
      message:
        `Every item goes back on the shelf and every payment on this sale is reversed ` +
        `(${formatRwf(current.amount_paid ?? 0)} to hand back). This can't be undone.`,
      confirmLabel: "Void sale",
      tone: "danger",
      input: { label: "Reason", required: true, placeholder: "Why is this sale being voided?" },
    });
    if (typeof reason !== "string" || !reason.trim()) return;
    voidSale.mutate(reason.trim(), {
      onSuccess: () => show(`Sale #S-${current.sale_id} voided.`, "success"),
      onError: (error) => show(messageOf(error), "error"),
    });
  }

  const stats: Stat[] = [
    { label: "Total", amount: s.total_amount },
    ...(Number(s.returned_amount ?? 0) > 0 ? [{ label: "Returned", amount: s.returned_amount, tone: "muted" as const }] : []),
    { label: "Paid", amount: s.amount_paid ?? 0, hint: `${(s.payments ?? []).length} payment${(s.payments ?? []).length === 1 ? "" : "s"}` },
    ...(s.status !== "voided"
      ? [{
          label: "Balance",
          amount: balance,
          tone: balance > 0 ? ("danger" as const) : ("success" as const),
          hint: balance > 0 && s.due_date ? `Due ${s.due_date}` : undefined,
        }]
      : []),
    { label: "Status", value: <SaleStatusTag status={s.status} /> },
  ];

  const lineColumns: DataColumn<SaleItem>[] = [
    {
      key: "product",
      header: "Product",
      primary: true,
      render: (item) => (
        <span>
          <Link href={`/products/${item.product}`} className="font-medium text-text hover:text-accent">
            {item.product_name ?? `#${item.product}`}
          </Link>
          {item.price_note && <span className="block text-xs text-text/50">{item.price_note}</span>}
          {item.approved_by_name && <span className="block text-xs text-text/50">Approved by {item.approved_by_name}</span>}
        </span>
      ),
    },
    { key: "quantity", header: "Qty", align: "right", mobile: true },
    ...(canManage ? [{ key: "list_price", header: "Catalog", money: true } as DataColumn<SaleItem>] : []),
    { key: "unit_price", header: "Sold at", money: true, mobile: true },
    { key: "subtotal", header: "Subtotal", money: true, mobile: true },
    ...(canManage
      ? [{ key: "cost_at_sale", header: "Cost", money: true, render: (item: SaleItem) => (item.cost_at_sale ? formatRwf(item.cost_at_sale) : "—") } as DataColumn<SaleItem>]
      : []),
  ];

  return (
    <Page
      title={`Sale #S-${s.sale_id}`}
      sharedName={sharedName("sale", s.sale_id)}
      description={`${when(s.sale_date)} · ${s.employee_name ?? `#${s.employee}`} · ${s.customer_name ?? "Walk-in"}`}
      back="/sales"
      primaryAction={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setDialog("receipt")}>Reprint receipt</Button>
          {canReturn && <Button variant="secondary" onClick={() => setDialog("return")}>Return items</Button>}
          {canManage && s.can_void && (
            <Button onClick={() => handleVoid(s)} disabled={voidSale.isPending}>
              {voidSale.isPending ? "Voiding…" : "Void"}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <StatStrip label="Sale summary" stats={stats} />

        {s.customer && (
          <p className="m-0 text-sm text-text/70">
            Customer:{" "}
            <Link href={`/customers/${s.customer}`} className="text-accent hover:underline">
              {s.customer_name}
            </Link>
          </p>
        )}
        {s.status === "voided" && (
          <p className="m-0 rounded-md bg-red-500/5 px-3 py-2 text-sm text-red-700">
            Voided {s.voided_at ? when(s.voided_at) : ""} by {s.voided_by_name ?? "—"}: {s.void_reason}
          </p>
        )}

        <Tabs
          label="Sale sections"
          value={tab}
          onChange={(id) => setTab(id as SaleTab)}
          tabs={[
            { id: "lines", label: "Lines", count: s.items.length },
            { id: "payments", label: "Payments", count: (s.payments ?? []).length },
            { id: "returns", label: "Returns", count: returnsCount },
            { id: "movements", label: "Movements", count: (s.movements ?? []).length },
          ]}
        >
          {(active) => {
            if (active === "lines") {
              return (
                <DataTable label="Sale lines" columns={lineColumns} rows={s.items} rowKey={(item) => String(item.sale_item_id)} />
              );
            }
            if (active === "payments") {
              return (s.payments ?? []).length === 0 ? (
                <EmptyState title="No payments" />
              ) : (
                <ul className="m-0 flex list-none flex-col divide-y divide-divider rounded-lg border border-divider bg-surface p-0 text-sm">
                  {(s.payments ?? []).map((p) => (
                    <li key={p.payment_id} className="flex flex-wrap justify-between gap-2 px-3 py-2.5">
                      <span>
                        {when(p.paid_at)} · {PAYMENT_METHOD_LABELS[p.method]}
                        {p.reference ? ` · ${p.reference}` : ""}
                        {p.direction === "out" && Number(p.amount) > 0 && <Tag variant="neutral" className="ml-1">Refund</Tag>}
                        {p.reversal_of && <Tag variant="danger" className="ml-1">Reversal</Tag>}
                      </span>
                      <span className="tabular-nums">
                        {p.direction === "out" ? "−" : ""}
                        {formatRwf(p.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              );
            }
            if (active === "returns") {
              return returnsCount === 0 ? (
                <EmptyState title="No returns" message={canReturn ? "Use Return items to take goods back." : undefined} />
              ) : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
                  {(s.returns ?? []).map((r) => (
                    <li key={r.return_id} className="rounded-lg border border-divider bg-surface px-3 py-2.5">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span>Return #{r.return_id} · {when(r.created_at)} · {r.created_by_name}</span>
                        <span className="tabular-nums">{formatRwf(r.refund_total)}</span>
                      </div>
                      <div className="text-xs text-text/60">
                        {r.items.map((i) => `${i.product_name} × ${i.quantity} (${i.condition})`).join(", ")} — {r.reason}
                      </div>
                      <div className="text-xs text-text/60">
                        Paid back {formatRwf(r.paid_out)}
                        {r.refund_method !== "balance" ? ` by ${PAYMENT_METHOD_LABELS[r.refund_method]}` : ""}
                        {Number(r.balance_reduced) > 0 ? ` · reduced the balance by ${formatRwf(r.balance_reduced)}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              );
            }
            return (s.movements ?? []).length === 0 ? (
              <EmptyState title="No movements" />
            ) : (
              <ul className="m-0 flex list-none flex-col divide-y divide-divider rounded-lg border border-divider bg-surface p-0 text-sm">
                {(s.movements ?? []).map((m) => (
                  <li key={m.movement_id} className="flex flex-wrap justify-between gap-2 px-3 py-2.5">
                    <span>
                      {when(m.created_at)} · {MOVEMENT_LABELS[m.movement_type] ?? m.movement_type} · {m.product_name}
                      {m.bucket !== "in_stock" ? ` (${m.bucket.replace("_", " ")})` : ""}
                    </span>
                    <span className="tabular-nums">{m.quantity_delta > 0 ? "+" : ""}{m.quantity_delta} → {m.balance_after}</span>
                  </li>
                ))}
              </ul>
            );
          }}
        </Tabs>
      </div>

      <Dialog open={dialog === "receipt"} onClose={() => setDialog(null)} title={`Receipt #S-${s.sale_id}`}>
        {dialog === "receipt" && (
          <Receipt sale={s} lines={[]} servedBy={s.employee_name ?? ""} onPrint={() => window.print()} reprint />
        )}
      </Dialog>
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
    </Page>
  );
}
