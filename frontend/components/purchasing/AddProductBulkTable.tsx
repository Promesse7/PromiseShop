"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAllPages, ApiError, extractErrorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { invalidatePurchaseItemQueries, useAddPurchaseItem } from "@/lib/purchasing/useAddPurchaseItem";
import { useToast } from "@/components/layout/ToastProvider";
import { buildAddItemPayload, validateAddItemForm, type AddItemFormValues } from "@/lib/purchasing/purchaseItemForm";
import { findExactProduct, searchProducts } from "@/lib/products/searchProducts";
import type { Category, Product } from "@/lib/types";

interface BulkRow {
  id: string;
  name: string;
  // Locked catalog product, set by picking a suggestion, typing the full name, or
  // scanning a barcode. Stored explicitly rather than re-derived from the name at
  // submit time, so two same-named catalog entries can't swap under the user.
  productId: number | null;
  category: number | "";
  quantity: string;
  unit_cost_paid: string;
  unit_cost_invoiced: string;
  selling_price: string;
  price_discrepancy_note: string;
  status: "pending" | "failed";
  error?: string;
}

function emptyRow(): BulkRow {
  return {
    id: crypto.randomUUID(),
    name: "", productId: null, category: "", quantity: "", unit_cost_paid: "", unit_cost_invoiced: "",
    selling_price: "", price_discrepancy_note: "",
    status: "pending",
  };
}

function rowToFormValues(row: BulkRow): AddItemFormValues {
  return {
    product: row.productId ?? "",
    category: row.category,
    name: row.name,
    brand: "",
    model_number: "",
    specifications: "",
    usage_instructions: "",
    warranty_months: "",
    reorder_level: "",
    selling_price: row.selling_price,
    quantity: row.quantity,
    unit_cost_paid: row.unit_cost_paid,
    unit_cost_invoiced: row.unit_cost_invoiced,
    price_discrepancy_note: row.price_discrepancy_note,
  };
}

interface AddProductBulkTableProps {
  purchaseId: number;
  onAdded: () => void;
}

export function AddProductBulkTable({ purchaseId, onAdded }: AddProductBulkTableProps) {
  const { show } = useToast();
  const queryClient = useQueryClient();
  const addItem = useAddPurchaseItem();
  const productsQuery = useQuery({ queryKey: ["products"], queryFn: () => fetchAllPages<Product>("products/") });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: () => fetchAllPages<Category>("categories/") });
  const [rows, setRows] = useState<BulkRow[]>([emptyRow()]);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
  // Until every page of the catalog is in, nothing can be trusted as "not in the
  // catalog" — so rows aren't classified and the batch can't be submitted.
  const catalogLoading = productsQuery.isLoading;
  const productById = useMemo(() => new Map(products.map((p) => [p.product_id, p])), [products]);

  function updateRow(id: string, patch: Partial<BulkRow>) {
    setRows((current) => {
      const next = current.map((r) => (r.id === id ? { ...r, ...patch } : r));
      const last = next[next.length - 1];
      if (last.name.trim() !== "") next.push(emptyRow());
      return next;
    });
  }

  function setRowName(id: string, name: string) {
    const exact = findExactProduct(products, name);
    updateRow(id, { name, productId: exact?.product_id ?? null, error: undefined });
  }

  function pickProduct(id: string, product: Product) {
    updateRow(id, { name: product.name, productId: product.product_id, error: undefined });
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((r) => r.id !== id));
  }

  async function handleSubmit() {
    if (catalogLoading) return;
    const candidateRows = rows.filter((r) => r.name.trim() !== "");
    if (candidateRows.length === 0) return;

    setSubmitting(true);
    let succeeded = 0;
    const remaining: BulkRow[] = [];

    for (const row of candidateRows) {
      const mode = row.productId != null ? "existing" : "new";
      const values = rowToFormValues(row);
      const validationErrors = validateAddItemForm(values, mode);
      const firstError = Object.values(validationErrors)[0];
      if (firstError) {
        remaining.push({ ...row, status: "failed", error: firstError });
        continue;
      }
      try {
        await addItem.mutateAsync({ purchaseId, payload: buildAddItemPayload(values, mode), invalidate: false });
        succeeded += 1;
      } catch (error) {
        const message =
          error instanceof ApiError ? extractErrorMessage(error.body) : "Something went wrong — try again.";
        remaining.push({ ...row, status: "failed", error: message });
      }
    }

    setRows(remaining.length > 0 ? [...remaining, emptyRow()] : [emptyRow()]);
    setSubmitting(false);
    if (succeeded > 0) {
      invalidatePurchaseItemQueries(queryClient, purchaseId);
      onAdded();
    }
    show(
      remaining.length === 0
        ? `${succeeded} of ${candidateRows.length} rows added.`
        : `${succeeded} of ${candidateRows.length} rows added — ${remaining.length} failed, see below.`,
      remaining.length === 0 ? "success" : "error"
    );
  }

  function printLabels() {
    window.print();
  }

  const categories = categoriesQuery.data ?? [];

  return (
    <div>
      {catalogLoading && <p className="text-sm text-text/50 mb-2">Loading catalog…</p>}
      <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-divider">
            <th className="text-left font-medium py-2 px-2 text-text/70">Product</th>
            <th className="text-left font-medium py-2 px-2 text-text/70">Category</th>
            <th className="text-right font-medium py-2 px-2 text-text/70">Qty</th>
            <th className="text-right font-medium py-2 px-2 text-text/70">Buy — paid</th>
            <th className="text-right font-medium py-2 px-2 text-text/70">Buy — invoiced</th>
            <th className="text-right font-medium py-2 px-2 text-text/70">Sell price</th>
            <th className="text-left font-medium py-2 px-2 text-text/70">Discrepancy note</th>
            <th className="text-left font-medium py-2 px-2 text-text/70">Match</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const matched = row.productId != null ? productById.get(row.productId) : undefined;
            const suggestions =
              !matched && !catalogLoading && activeRowId === row.id ? searchProducts(products, row.name) : [];
            return (
              <tr key={row.id} className="border-b border-divider align-top">
                <td className="py-1 px-2">
                  <input
                    aria-label="Product name"
                    value={row.name}
                    onFocus={() => setActiveRowId(row.id)}
                    onChange={(e) => setRowName(row.id, e.target.value)}
                    placeholder="Type a name or scan a barcode…"
                    className="min-h-8 py-1 px-2 text-sm text-text bg-surface border border-divider rounded-md w-full"
                  />
                  {suggestions.length > 0 && (
                    <div className="flex flex-col gap-0.5 mt-1">
                      {suggestions.map((p) => (
                        <button
                          key={p.product_id}
                          type="button"
                          onClick={() => pickProduct(row.id, p)}
                          className="text-left text-sm py-1 px-2 hover:bg-text/[0.07] rounded-md"
                        >
                          {p.name} <span className="text-xs font-mono text-text/50">{p.barcode}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {row.error && <p className="text-xs text-red-400 mt-1">{row.error}</p>}
                </td>
                <td className="py-1 px-2">
                  {matched ? (
                    <span className="text-xs text-text/50">reused</span>
                  ) : (
                    <select
                      aria-label="Category"
                      value={row.category}
                      onChange={(e) => updateRow(row.id, { category: e.target.value === "" ? "" : Number(e.target.value) })}
                      className="min-h-8 py-1 px-2 text-sm text-text bg-surface border border-divider rounded-md"
                    >
                      <option value="">…</option>
                      {categories.map((c) => (
                        <option key={c.category_id} value={c.category_id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="py-1 px-2 text-right">
                  <input aria-label="Quantity" value={row.quantity} onChange={(e) => updateRow(row.id, { quantity: e.target.value })} className="min-h-8 py-1 px-2 text-sm text-right text-text bg-surface border border-divider rounded-md w-16" />
                </td>
                <td className="py-1 px-2 text-right">
                  <input aria-label="Buy price paid" value={row.unit_cost_paid} onChange={(e) => updateRow(row.id, { unit_cost_paid: e.target.value })} className="min-h-8 py-1 px-2 text-sm text-right text-text bg-surface border border-divider rounded-md w-24" />
                </td>
                <td className="py-1 px-2 text-right">
                  <input aria-label="Buy price invoiced" value={row.unit_cost_invoiced} onChange={(e) => updateRow(row.id, { unit_cost_invoiced: e.target.value })} className="min-h-8 py-1 px-2 text-sm text-right text-text bg-surface border border-divider rounded-md w-24" />
                </td>
                <td className="py-1 px-2 text-right">
                  <input aria-label="Sell price" value={row.selling_price} onChange={(e) => updateRow(row.id, { selling_price: e.target.value })} disabled={!!matched} className="min-h-8 py-1 px-2 text-sm text-right text-text bg-surface border border-divider rounded-md w-24 disabled:opacity-40" />
                </td>
                <td className="py-1 px-2">
                  <input
                    aria-label="Discrepancy note"
                    value={row.price_discrepancy_note}
                    onChange={(e) => updateRow(row.id, { price_discrepancy_note: e.target.value })}
                    placeholder="Required when paid ≠ invoiced"
                    className="min-h-8 py-1 px-2 text-sm text-text bg-surface border border-divider rounded-md w-40"
                  />
                </td>
                <td className="py-1 px-2 text-xs">
                  {matched ? (
                    <span className="font-mono">Existing · {matched.barcode}</span>
                  ) : row.name.trim() && !catalogLoading ? (
                    <span className="text-text/50">New product</span>
                  ) : (
                    ""
                  )}
                </td>
                <td className="py-1 px-2">
                  {row.name.trim() && (
                    <button type="button" onClick={() => removeRow(row.id)} className="text-xs text-text/50">
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <p className="text-sm text-text/50 mt-3">
        Pick from the catalog as you type, or scan a barcode. Names not in the catalog are added as new
        products. Rows with paid ≠ invoiced need a discrepancy note per line.
      </p>
      <div className="flex gap-2 justify-end mt-3">
        <Button variant="secondary" onClick={printLabels}>
          Print all new labels
        </Button>
        <Button onClick={handleSubmit} disabled={submitting || catalogLoading}>
          {submitting ? "Adding…" : "Add all rows"}
        </Button>
      </div>
    </div>
  );
}
