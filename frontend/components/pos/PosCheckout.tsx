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
import { SaleSuccessCheck } from "./SaleSuccessCheck";
import { Button } from "@/components/ui/Button";
import { Card, CardKicker } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Page } from "@/components/ui/Page";
import { formatRwf } from "@/lib/format";
import { useIsDesktop } from "@/lib/useMediaQuery";
import { STICKY_BOTTOM_TRANSITION, useStickyBottomStyle } from "@/components/shell/useStickyBottomStyle";
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
  const isDesktop = useIsDesktop();
  const stickyBottom = useStickyBottomStyle();
  const [payOpen, setPayOpen] = useState(false);
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
      setPayOpen(false);
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
      <Page title="Sale complete">
        <div className="flex flex-col gap-4">
          <SaleSuccessCheck />
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
        </div>
      </Page>
    );
  }

  const cartHandlers = {
    onSetQuantity: (id: number, quantity: number) => setLines((current) => setQuantity(current, id, quantity)),
    onSetUnitPrice: (id: number, price: number) => setLines((current) => setUnitPrice(current, id, price)),
    onSetPriceNote: (id: number, note: string) => setLines((current) => setPriceNote(current, id, note)),
  };

  const scanArea = catalog.isError ? (
    <div className="mb-4">
      <ErrorState message="Couldn't load the product catalog." onRetry={() => window.location.reload()} />
    </div>
  ) : catalog.isLoading ? (
    <div className="mb-4">
      <LoadingState variant="form" rows={1} label="Loading catalog…" />
    </div>
  ) : (
    <ScanSearchField catalog={catalog} onAdd={handleAdd} />
  );

  const warnings = (
    <>
      {unpricedLines.length > 0 && (
        <p className="text-sm text-red-500 mt-2">
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
        <p className="text-sm text-red-500 mt-2">Add a note for each line below the minimum price.</p>
      )}
    </>
  );

  const totalCard = (
    <Card elevation="md">
      <CardKicker>Total</CardKicker>
      <div className="flex justify-between text-sm">
        <span>Items ({itemCount})</span>
        <span>{formatRwf(subtotal)}</span>
      </div>
      {adjustment !== 0 && (
        <div className="flex justify-between text-sm text-text/70 mt-1">
          <span>{adjustment < 0 ? "Discount vs catalog" : "Markup vs catalog"}</span>
          <span>
            {adjustment < 0 ? "−" : "+"} {formatRwf(Math.abs(adjustment))}
          </span>
        </div>
      )}
      <div className="flex justify-between font-sans font-medium text-xl mt-1.5">
        <span>Due</span>
        <span className="text-accent-600">{formatRwf(subtotal)}</span>
      </div>
    </Card>
  );

  const paymentArea = (
    <>
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
    </>
  );

  const completeButton = (
    <Button block disabled={!canComplete} onClick={handleCompleteSale} className="min-h-11">
      {submitting ? "Completing…" : "Complete sale"}
    </Button>
  );

  const approvalDialog = (
    <ApprovalDialog
      key={approvalPrompt ? "open" : "closed"}
      open={approvalPrompt !== null}
      reason={approvalPrompt?.reason ?? ""}
      error={approvalPrompt?.error}
      submitting={submitting}
      onApprove={(approval) => submitSale(approval)}
      onClose={() => setApprovalPrompt(null)}
    />
  );

  if (!isDesktop) {
    return (
      <Page title="New sale" description="Scan or search to add items">
        {/* Room for the pay bar and the shell's tab bar underneath it. */}
        <div className="flex flex-col gap-2 pb-24">
          <div className="sticky top-0 z-10 -mx-1 bg-bg/95 px-1 pt-1 backdrop-blur">{scanArea}</div>
          <CartCards lines={lines} verdicts={verdicts} {...cartHandlers} />
          {warnings}
        </div>
        <section
          aria-label="Sale total"
          style={stickyBottom}
          className={`fixed inset-x-0 z-20 border-t border-divider bg-surface/95 px-4 py-2.5 shadow-lg backdrop-blur print:hidden ${STICKY_BOTTOM_TRANSITION}`}
        >
          <div className="mx-auto flex max-w-[640px] items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-text/60">
                {itemCount} item{itemCount === 1 ? "" : "s"}
              </div>
              <div className="font-sans text-lg font-semibold tabular-nums">{formatRwf(subtotal)}</div>
            </div>
            <Button disabled={lines.length === 0} onClick={() => setPayOpen(true)} className="min-h-11 px-5">
              Pay →
            </Button>
          </div>
        </section>
        <Dialog
          open={payOpen}
          onClose={() => setPayOpen(false)}
          title="Payment"
          size="lg"
          footer={completeButton}
        >
          <div className="flex flex-col gap-4">
            {totalCard}
            {paymentArea}
          </div>
        </Dialog>
        {approvalDialog}
      </Page>
    );
  }

  return (
    <Page title="New sale" description="Scan or search to add items">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6">
        <div>
          {scanArea}
          <CartTable lines={lines} verdicts={verdicts} onRemove={(id) => setLines((current) => removeItem(current, id))} {...cartHandlers} />
          {warnings}
        </div>
        <div className="flex flex-col gap-4">
          {totalCard}
          {paymentArea}
          {completeButton}
        </div>
      </div>
      {approvalDialog}
    </Page>
  );
}
