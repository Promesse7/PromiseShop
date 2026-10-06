"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { usePosCatalog } from "@/lib/pos/usePosCatalog";
import { usePriceCheck } from "@/lib/pos/usePriceCheck";
import {
  addItem, removeItem, saleItemsPayload, setPriceNote, setQuantity, setUnitPrice, totals, type CartLine,
} from "@/lib/pos/cart";
import { newPaymentLine, paymentLinesPayload, summarisePayments, type PaymentLine } from "@/lib/pos/payments";
import { apiFetch, ApiError, extractErrorMessage } from "@/lib/api-client";
import { useToast } from "@/components/layout/ToastProvider";
import { ScanSearchField } from "./ScanSearchField";
import { CartTable } from "./CartTable";
import { CartCards } from "./CartCards";
import { Receipt } from "./Receipt";
import { CustomerPicker } from "./CustomerPicker";
import { PaymentPanel } from "./PaymentPanel";
import { ApprovalDialog, type Approval } from "./ApprovalDialog";
import { Button } from "@/components/ui/Button";
import { Card, CardKicker } from "@/components/ui/Card";
import type { Customer, PosProduct, Sale } from "@/lib/types";

interface PosCheckoutProps {
  servedBy: string;
}

// Credit is due in 30 days unless the cashier picks another date (Kigali local date).
function defaultDueDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function errorCode(body: unknown): string | undefined {
  return body && typeof body === "object" && "code" in body ? String((body as { code: unknown }).code) : undefined;
}

export function PosCheckout({ servedBy }: PosCheckoutProps) {
  const catalog = usePosCatalog();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  // null = the default: one cash payment for the whole total, following the cart.
  const [payments, setPayments] = useState<PaymentLine[] | null>(null);
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [submitting, setSubmitting] = useState(false);
  const [approvalPrompt, setApprovalPrompt] = useState<{ reason: string; error: string | null } | null>(null);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [completedLines, setCompletedLines] = useState<CartLine[]>([]);
  const verdicts = usePriceCheck(lines);

  const { itemCount, subtotal, listSubtotal } = totals(lines);
  const adjustment = subtotal - listSubtotal;
  const paymentLines = payments ?? [{ ...newPaymentLine("cash", subtotal), id: "default-cash" }];
  const paymentSummary = summarisePayments(paymentLines, subtotal);

  function handleAdd(product: PosProduct) {
    setLines((current) => addItem(current, product));
  }

  const unpricedLines = lines.filter((line) => line.unitPrice <= 0);
  const missingNotes = lines.filter(
    (line) => verdicts.get(line.product.product_id)?.needs_note && !(line.priceNote ?? "").trim()
  );
  const needsCustomer = paymentSummary.remaining > 0 && customer === null;
  const canComplete =
    lines.length > 0 &&
    unpricedLines.length === 0 &&
    missingNotes.length === 0 &&
    !paymentSummary.nonCashOver &&
    !paymentSummary.missingReference &&
    !needsCustomer &&
    !submitting;

  async function submitSale(approval?: Approval) {
    setSubmitting(true);
    try {
      const sale = await apiFetch<Sale>("sales/", {
        method: "POST",
        body: JSON.stringify({
          items: saleItemsPayload(lines),
          payments: paymentLinesPayload(paymentLines),
          ...(customer ? { customer: customer.customer_id } : {}),
          ...(paymentSummary.remaining > 0 && dueDate ? { due_date: dueDate } : {}),
          ...(approval ? { approval } : {}),
        }),
      });
      setCompletedSale(sale);
      for (const key of ["inventory", "stock-movements", "customers", "debts", "sales", "payments"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      queryClient.invalidateQueries({ queryKey: ["product-pricing", "current"] });
      setCompletedLines(lines);
      setLines([]);
      setCustomer(null);
      setPayments(null);
      setDueDate(defaultDueDate());
      setApprovalPrompt(null);
    } catch (error) {
      const body = error instanceof ApiError ? error.body : null;
      const message = body ? extractErrorMessage(body) : "Something went wrong — try again.";
      const code = errorCode(body);
      if (code === "approval_required") {
        setApprovalPrompt({ reason: message, error: null });
      } else if (approvalPrompt && (code === "approval_refused" || code === "throttled")) {
        setApprovalPrompt({ ...approvalPrompt, error: message });
      } else {
        setApprovalPrompt(null);
        show(message, "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleCompleteSale() {
    if (!canComplete) return;
    const needsApproval = lines.some((line) => verdicts.get(line.product.product_id)?.needs_approval);
    if (needsApproval) {
      setApprovalPrompt({ reason: "One or more prices need a manager's approval.", error: null });
      return;
    }
    submitSale();
  }

  if (completedSale) {
    return (
      <Receipt
        sale={completedSale}
        lines={completedLines}
        servedBy={servedBy}
        onPrint={() => window.print()}
        onNewSale={() => {
          setCompletedSale(null);
          setCompletedLines([]);
        }}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6">
      <div>
        <h4 className="mb-4">New sale</h4>
        {catalog.isError ? (
          <div className="mb-4 text-sm text-red-400">
            Couldn&apos;t load the product catalog.{" "}
            <button type="button" className="underline" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        ) : catalog.isLoading ? (
          <p className="text-sm text-text/50 mb-4">Loading catalog…</p>
        ) : (
          <ScanSearchField catalog={catalog} onAdd={handleAdd} />
        )}
        <CartTable
          lines={lines}
          onSetQuantity={(id, quantity) => setLines((current) => setQuantity(current, id, quantity))}
          onSetUnitPrice={(id, price) => setLines((current) => setUnitPrice(current, id, price))}
          onRemove={(id) => setLines((current) => removeItem(current, id))}
          verdicts={verdicts}
          onSetPriceNote={(id, note) => setLines((current) => setPriceNote(current, id, note))}
        />
        <CartCards
          lines={lines}
          onSetQuantity={(id, quantity) => setLines((current) => setQuantity(current, id, quantity))}
          onSetUnitPrice={(id, price) => setLines((current) => setUnitPrice(current, id, price))}
          verdicts={verdicts}
          onSetPriceNote={(id, note) => setLines((current) => setPriceNote(current, id, note))}
        />
        {unpricedLines.length > 0 && (
          <p className="text-sm text-red-400 mt-2">
            Set a price for{" "}
            {unpricedLines.map((line, i) => (
              <span key={line.product.product_id}>
                {i > 0 && ", "}
                <Link href={`/products/${line.product.product_id}`} className="underline">
                  {line.product.name}
                </Link>
              </span>
            ))}{" "}
            before completing the sale.
          </p>
        )}
        {missingNotes.length > 0 && (
          <p className="text-sm text-red-400 mt-2">Add a note for each line below the minimum price.</p>
        )}
      </div>
      <div className="flex flex-col gap-4">
        <Card elevation="md">
          <CardKicker>Total</CardKicker>
          <div className="flex justify-between text-sm">
            <span>Items ({itemCount})</span>
            <span>RWF {subtotal.toLocaleString()}</span>
          </div>
          {adjustment !== 0 && (
            <div className="flex justify-between text-sm text-text/70 mt-1">
              <span>{adjustment < 0 ? "Discount vs catalog" : "Markup vs catalog"}</span>
              <span>
                {adjustment < 0 ? "−" : "+"} RWF {Math.abs(adjustment).toLocaleString()}
              </span>
            </div>
          )}
          <div className="flex justify-between font-sans font-medium text-xl mt-1.5">
            <span>Due</span>
            <span className="text-accent-300">RWF {subtotal.toLocaleString()}</span>
          </div>
        </Card>
        <div>
          <label className="block text-xs text-text/70 mb-1">
            Customer (optional — walk-in if blank; needed for credit)
          </label>
          <CustomerPicker value={customer} onChange={setCustomer} />
        </div>
        <PaymentPanel
          total={subtotal}
          lines={paymentLines}
          onChange={setPayments}
          dueDate={dueDate}
          onDueDateChange={setDueDate}
          hasCustomer={customer !== null}
        />
        <Button block disabled={!canComplete} onClick={handleCompleteSale} className="min-h-11">
          {submitting ? "Completing…" : "Complete sale"}
        </Button>
      </div>
      <ApprovalDialog
        key={approvalPrompt ? "open" : "closed"}
        open={approvalPrompt !== null}
        reason={approvalPrompt?.reason ?? ""}
        error={approvalPrompt?.error}
        submitting={submitting}
        onApprove={(approval) => submitSale(approval)}
        onClose={() => setApprovalPrompt(null)}
      />
    </div>
  );
}
