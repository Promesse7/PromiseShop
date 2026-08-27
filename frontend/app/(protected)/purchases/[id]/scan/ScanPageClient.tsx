"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { fetchAllPages, ApiError, extractErrorMessage } from "@/lib/api-client";
import { usePurchaseDetail } from "@/lib/purchasing/usePurchaseDetail";
import { useAddPurchaseItem } from "@/lib/purchasing/useAddPurchaseItem";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { useToast } from "@/components/layout/ToastProvider";
import { emptyExistingProductItemValues, buildAddItemPayload, validateAddItemForm } from "@/lib/purchasing/purchaseItemForm";
import type { Product } from "@/lib/types";

interface ScanPageClientProps {
  purchaseId: number;
}

export default function ScanPageClient({ purchaseId }: ScanPageClientProps) {
  const { show } = useToast();
  const { purchase, isLoading, isError } = usePurchaseDetail(purchaseId);
  const productsQuery = useQuery({ queryKey: ["products"], queryFn: () => fetchAllPages<Product>("products/") });
  const addItem = useAddPurchaseItem();

  const [search, setSearch] = useState("");
  const [scanned, setScanned] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState("");
  const [paid, setPaid] = useState("");
  const [invoiced, setInvoiced] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const match = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !productsQuery.data) return undefined;
    return productsQuery.data.find(
      (p) => p.barcode.toLowerCase() === q || p.name.toLowerCase().includes(q)
    );
  }, [productsQuery.data, search]);

  const summary = useMemo(() => {
    if (!purchase) return null;
    const items = purchase.items;
    const productCount = new Set(items.map((i) => i.product)).size;
    const unitCount = items.reduce((sum, i) => sum + i.quantity, 0);
    return { productCount, unitCount };
  }, [purchase]);

  function selectScanned(product: Product) {
    setScanned(product);
    setSearch("");
    setQuantity("");
    setPaid("");
    setInvoiced("");
    setNote("");
    setError(null);
  }

  async function handleAdd() {
    if (!scanned) return;
    const values = { ...emptyExistingProductItemValues(scanned.product_id), quantity, unit_cost_paid: paid, unit_cost_invoiced: invoiced, price_discrepancy_note: note };
    const validationErrors = validateAddItemForm(values, "existing");
    const firstError = Object.values(validationErrors)[0];
    if (firstError) {
      setError(firstError);
      return;
    }
    setError(null);
    try {
      await addItem.mutateAsync({ purchaseId, payload: buildAddItemPayload(values, "existing") });
      show("Added to purchase.", "success");
      setScanned(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(extractErrorMessage(err.body));
      } else {
        show("Something went wrong — try again.", "error");
      }
    }
  }

  if (isError) {
    return <ErrorState message="Couldn't load this purchase." />;
  }

  if (isLoading || !purchase) {
    return <p className="text-sm text-text/50">Loading…</p>;
  }

  return (
    <div>
      <Link href={`/purchases/${purchaseId}`} className="text-sm">
        ← Purchase
      </Link>
      <h4 className="mt-2 mb-3">Receive stock</h4>
      <div className="flex gap-2 mb-3">
        <input
          aria-label="Scan received item…"
          placeholder="Scan received item…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-11 flex-1 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md"
        />
      </div>
      {match && !scanned && (
        <button
          type="button"
          onClick={() => selectScanned(match)}
          className="text-left text-sm mb-3 underline"
        >
          {match.name} <span className="font-mono text-xs text-text/50">{match.barcode}</span>
        </button>
      )}

      {scanned && (
        <Card elevation="md">
          <span className="card-kicker text-[10px] tracking-wide uppercase text-accent">Just scanned</span>
          <div className="text-[15px]">
            {scanned.name} <span className="font-mono text-text/50 ml-2 text-sm">{scanned.barcode}</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="scan-quantity" className="block text-xs text-text/70">Quantity</label>
              <input id="scan-quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="min-h-11 py-1.5 px-2.5 text-sm text-right text-text bg-surface border border-divider rounded-md" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="scan-paid" className="block text-xs text-text/70">Unit cost paid</label>
              <input id="scan-paid" value={paid} onChange={(e) => setPaid(e.target.value)} className="min-h-11 py-1.5 px-2.5 text-sm text-right text-text bg-surface border border-divider rounded-md" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="scan-invoiced" className="block text-xs text-text/70">Unit cost invoiced</label>
              <input id="scan-invoiced" value={invoiced} onChange={(e) => setInvoiced(e.target.value)} className="min-h-11 py-1.5 px-2.5 text-sm text-right text-text bg-surface border border-divider rounded-md" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="scan-note" className="block text-xs text-text/70">Discrepancy note (required when costs differ)</label>
            <input id="scan-note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-11 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md" />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <Button className="min-h-11" onClick={handleAdd} disabled={addItem.isPending}>
            {addItem.isPending ? "Adding…" : `Add to purchase #P-${purchaseId}`}
          </Button>
        </Card>
      )}

      {summary && (
        <p className="text-sm mt-4">
          Received so far — {summary.productCount} products · {summary.unitCount} units · paid{" "}
          {purchase.total_paid != null ? `RWF ${Number(purchase.total_paid).toLocaleString()}` : "—"} / invoiced{" "}
          {purchase.total_invoiced != null ? `RWF ${Number(purchase.total_invoiced).toLocaleString()}` : "—"}
        </p>
      )}
    </div>
  );
}
