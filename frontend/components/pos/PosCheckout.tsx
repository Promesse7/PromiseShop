"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePosCatalog } from "@/lib/pos/usePosCatalog";
import { addItem, removeItem, setQuantity, totals, type CartLine } from "@/lib/pos/cart";
import { apiFetch, ApiError, extractErrorMessage } from "@/lib/api-client";
import { useToast } from "@/components/layout/ToastProvider";
import { ScanSearchField } from "./ScanSearchField";
import { CartTable } from "./CartTable";
import { CartCards } from "./CartCards";
import { Receipt } from "./Receipt";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Button } from "@/components/ui/Button";
import { Card, CardKicker } from "@/components/ui/Card";
import type { PaymentMethod, PosProduct, Sale } from "@/lib/types";

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "MoMo" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank" },
];

interface PosCheckoutProps {
  servedBy: string;
}

export function PosCheckout({ servedBy }: PosCheckoutProps) {
  const catalog = usePosCatalog();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [submitting, setSubmitting] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [completedLines, setCompletedLines] = useState<CartLine[]>([]);

  function handleAdd(product: PosProduct) {
    setLines((current) => addItem(current, product));
  }

  function handleSetQuantity(productId: number, quantity: number) {
    setLines((current) => setQuantity(current, productId, quantity));
  }

  function handleRemove(productId: number) {
    setLines((current) => removeItem(current, productId));
  }

  async function handleCompleteSale() {
    if (lines.length === 0) return;
    setSubmitting(true);
    try {
      const sale = await apiFetch<Sale>("sales/", {
        method: "POST",
        body: JSON.stringify({
          items: lines.map((line) => ({ product: line.product.product_id, quantity: line.quantity })),
          payment_method: paymentMethod,
        }),
      });
      setCompletedSale(sale);
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["product-pricing", "current"] });
      setCompletedLines(lines);
      setLines([]);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? extractErrorMessage(error.body)
          : "Something went wrong — try again.";
      show(message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  function handleNewSale() {
    setCompletedSale(null);
    setCompletedLines([]);
  }

  if (completedSale) {
    return (
      <Receipt
        sale={completedSale}
        lines={completedLines}
        servedBy={servedBy}
        onPrint={() => window.print()}
        onNewSale={handleNewSale}
      />
    );
  }

  const { itemCount, subtotal } = totals(lines);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6">
      <div>
        <h4 className="mb-4">New sale</h4>
        {catalog.isError ? (
          <div className="mb-4 text-sm text-red-400">
            Couldn&apos;t load the product catalog.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </div>
        ) : catalog.isLoading ? (
          <p className="text-sm text-text/50 mb-4">Loading catalog…</p>
        ) : (
          <ScanSearchField catalog={catalog} onAdd={handleAdd} />
        )}
        <CartTable lines={lines} onSetQuantity={handleSetQuantity} onRemove={handleRemove} />
        <CartCards lines={lines} onSetQuantity={handleSetQuantity} />
      </div>
      <div className="flex flex-col gap-4">
        <Card elevation="md">
          <CardKicker>Total</CardKicker>
          <div className="flex justify-between text-sm">
            <span>Items ({itemCount})</span>
            <span>RWF {subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between font-sans font-medium text-xl mt-1.5">
            <span>Due</span>
            <span className="text-accent-300">RWF {subtotal.toLocaleString()}</span>
          </div>
        </Card>
        <div>
          <label className="block text-xs text-text/70 mb-1">Payment method</label>
          <SegmentedToggle
            name="payment"
            options={PAYMENT_OPTIONS}
            value={paymentMethod}
            onChange={(value) => setPaymentMethod(value as PaymentMethod)}
          />
        </div>
        <div>
          <label className="block text-xs text-text/70 mb-1">
            Customer (optional — walk-in if blank)
          </label>
          <input
            className="w-full min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md hover:border-text/45 focus-visible:border-accent focus-visible:outline-none"
            placeholder="Search name or phone…"
            disabled
          />
        </div>
        <Button
          block
          disabled={lines.length === 0 || submitting}
          onClick={handleCompleteSale}
          className="min-h-11"
        >
          {submitting ? "Completing…" : "Complete sale"}
        </Button>
      </div>
    </div>
  );
}
