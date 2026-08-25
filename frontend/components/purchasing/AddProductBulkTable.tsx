"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAllPages, ApiError, extractErrorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { useAddPurchaseItem } from "@/lib/purchasing/useAddPurchaseItem";
import { useToast } from "@/components/layout/ToastProvider";
import { buildAddItemPayload, validateAddItemForm, type AddItemFormValues } from "@/lib/purchasing/purchaseItemForm";
import type { Category, Product } from "@/lib/types";

interface BulkRow {
  id: string;
  name: string;
  category: number | "";
  quantity: string;
  unit_cost_paid: string;
  unit_cost_invoiced: string;
  selling_price: string;
  status: "pending" | "failed";
  error?: string;
}

function emptyRow(): BulkRow {
  return {
    id: crypto.randomUUID(),
    name: "", category: "", quantity: "", unit_cost_paid: "", unit_cost_invoiced: "", selling_price: "",
    status: "pending",
  };
}

function rowToFormValues(row: BulkRow, matchedProductId: number | ""): AddItemFormValues {
  return {
    product: matchedProductId,
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
    price_discrepancy_note: "",
  };
}

interface AddProductBulkTableProps {
  purchaseId: number;
  onAdded: () => void;
}

export function AddProductBulkTable({ purchaseId, onAdded }: AddProductBulkTableProps) {
  const { show } = useToast();
  const addItem = useAddPurchaseItem();
  const productsQuery = useQuery({ queryKey: ["products"], queryFn: () => fetchAllPages<Product>("products/") });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: () => fetchAllPages<Category>("categories/") });
  const [rows, setRows] = useState<BulkRow[]>([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);

  const productByName = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of productsQuery.data ?? []) map.set(p.name.trim().toLowerCase(), p);
    return map;
  }, [productsQuery.data]);

  function updateRow(id: string, patch: Partial<BulkRow>) {
    setRows((current) => {
      const next = current.map((r) => (r.id === id ? { ...r, ...patch } : r));
      const last = next[next.length - 1];
      if (last.name.trim() !== "") next.push(emptyRow());
      return next;
    });
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((r) => r.id !== id));
  }

  async function handleSubmit() {
    const candidateRows = rows.filter((r) => r.name.trim() !== "");
    if (candidateRows.length === 0) return;

    setSubmitting(true);
    let succeeded = 0;
    const remaining: BulkRow[] = [];

    for (const row of candidateRows) {
      const matched = productByName.get(row.name.trim().toLowerCase());
      const mode = matched ? "existing" : "new";
      const values = rowToFormValues(row, matched ? matched.product_id : "");
      const validationErrors = validateAddItemForm(values, mode);
      const firstError = Object.values(validationErrors)[0];
      if (firstError) {
        remaining.push({ ...row, status: "failed", error: firstError });
        continue;
      }
      try {
        await addItem.mutateAsync({ purchaseId, payload: buildAddItemPayload(values, mode) });
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
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-divider">
            <th className="text-left font-medium py-2 px-2 text-text/70">Product</th>
            <th className="text-left font-medium py-2 px-2 text-text/70">Category</th>
            <th className="text-right font-medium py-2 px-2 text-text/70">Qty</th>
            <th className="text-right font-medium py-2 px-2 text-text/70">Buy — paid</th>
            <th className="text-right font-medium py-2 px-2 text-text/70">Buy — invoiced</th>
            <th className="text-right font-medium py-2 px-2 text-text/70">Sell price</th>
            <th className="text-left font-medium py-2 px-2 text-text/70">Match</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const matched = productByName.get(row.name.trim().toLowerCase());
            return (
              <tr key={row.id} className="border-b border-divider">
                <td className="py-1 px-2">
                  <input
                    aria-label="Product name"
                    value={row.name}
                    onChange={(e) => updateRow(row.id, { name: e.target.value })}
                    placeholder="Type to add or pick from catalog…"
                    className="min-h-8 py-1 px-2 text-sm text-text bg-surface border border-divider rounded-md w-full"
                  />
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
                <td className="py-1 px-2 font-mono text-xs">
                  {matched ? <span>{matched.barcode} (existing)</span> : row.name.trim() ? <span className="text-text/50">assigned on receive</span> : ""}
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
      <p className="text-sm text-text/50 mt-3">
        Rows with paid ≠ invoiced require a discrepancy note — add it after the item lands in
        &quot;On this purchase&quot; via Edit product.
      </p>
      <div className="flex gap-2 justify-end mt-3">
        <Button variant="secondary" onClick={printLabels}>
          Print all new labels
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Adding…" : "Add all rows"}
        </Button>
      </div>
    </div>
  );
}
