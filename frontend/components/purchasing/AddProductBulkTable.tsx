"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAllPages, ApiError, extractErrorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { LabelSheet } from "@/components/ui/LabelSheet";
import { ProductLabel } from "@/components/products/ProductLabel";
import { useToast } from "@/components/layout/ToastProvider";
import { ProductCombobox } from "@/components/purchasing/ProductCombobox";
import { fetchProductSearch } from "@/lib/products/useProductSearch";
import { useRecentSupplierProducts } from "@/lib/suppliers/useRecentSupplierProducts";
import {
  autoMatch,
  buildBulkPayload,
  emptyBulkRow,
  isBlankRow,
  parsePastedRows,
  validateBulkRow,
  type BulkRow,
} from "@/lib/purchasing/bulkRows";
import { bulkRowErrors, describeRowError, useBulkAddPurchaseItems } from "@/lib/purchasing/useBulkAddPurchaseItems";
import type { Category, ProductSearchResult, SupplierRecentProduct } from "@/lib/types";

type Field = "product" | "quantity" | "paid" | "invoiced";
const NEXT_FIELD: Record<Exclude<Field, "invoiced">, Field> = { product: "quantity", quantity: "paid", paid: "invoiced" };

interface LabelToPrint {
  key: string;
  name: string;
  barcode: string;
  retail_price: number;
  copies: number;
}

interface AddProductBulkTableProps {
  purchaseId: number;
  /** Enables the "Recent from this supplier" chips. */
  supplierId?: number;
  onAdded: () => void;
}

/** Keep exactly one blank row at the end, so there's always somewhere to type. */
function withTrailingBlank(rows: BulkRow[]): BulkRow[] {
  const trimmed = [...rows];
  while (trimmed.length > 1 && isBlankRow(trimmed[trimmed.length - 1]) && isBlankRow(trimmed[trimmed.length - 2])) {
    trimmed.pop();
  }
  if (trimmed.length === 0 || !isBlankRow(trimmed[trimmed.length - 1])) trimmed.push(emptyBulkRow());
  return trimmed;
}

const inputClass = "min-h-8 py-1 px-2 text-sm text-text bg-surface border border-divider rounded-md";

export function AddProductBulkTable({ purchaseId, supplierId, onAdded }: AddProductBulkTableProps) {
  const { show } = useToast();
  const bulkAdd = useBulkAddPurchaseItems();
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: () => fetchAllPages<Category>("categories/") });
  const recent = useRecentSupplierProducts(supplierId);
  const [rows, setRows] = useState<BulkRow[]>([emptyBulkRow()]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [matchingPaste, setMatchingPaste] = useState(false);
  const [labels, setLabels] = useState<LabelToPrint[]>([]);

  const categories = categoriesQuery.data ?? [];

  function focusField(rowId: string, field: Field) {
    setTimeout(() => {
      // Row ids are UUIDs, so the selector is unique on the page.
      const el = document.querySelector<HTMLElement>(`[data-row="${rowId}"][data-field="${field}"]`);
      el?.focus();
    }, 0);
  }

  function updateRow(id: string, patch: Partial<BulkRow>) {
    setRows((current) => withTrailingBlank(current.map((r) => (r.id === id ? { ...r, ...patch, error: undefined, pasted: false } : r))));
  }

  function pick(id: string, product: Pick<ProductSearchResult, "product_id" | "name" | "barcode"> & Partial<ProductSearchResult>) {
    updateRow(id, { name: product.name, choice: { kind: "existing", product }, selling_price: "", category: "" });
    focusField(id, "quantity");
  }

  function createNew(id: string, name: string) {
    updateRow(id, { name, choice: { kind: "new" } });
    focusField(id, "quantity");
  }

  function clearChoice(id: string) {
    updateRow(id, { choice: null });
    focusField(id, "product");
  }

  function removeRow(id: string) {
    setRows((current) => withTrailingBlank(current.filter((r) => r.id !== id)));
  }

  function onFieldEnter(rowId: string, field: Exclude<Field, "product">) {
    if (field !== "invoiced") {
      focusField(rowId, NEXT_FIELD[field]);
      return;
    }
    // Last field: jump to the next row's product cell (the trailing blank row exists by construction).
    const index = rows.findIndex((r) => r.id === rowId);
    const next = rows[index + 1];
    if (next) {
      focusField(next.id, "product");
    } else {
      const fresh = emptyBulkRow();
      setRows((current) => [...current, fresh]);
      focusField(fresh.id, "product");
    }
  }

  function addRecent(product: SupplierRecentProduct) {
    const row: BulkRow = {
      ...emptyBulkRow(),
      name: product.name,
      choice: { kind: "existing", product: { product_id: product.product_id, name: product.name, barcode: product.barcode } },
    };
    setRows((current) => withTrailingBlank([...current.filter((r) => !isBlankRow(r)), row]));
    focusField(row.id, "quantity");
  }

  async function matchPaste() {
    const parsed = parsePastedRows(pasteText);
    if (parsed.length === 0) {
      show("Nothing to paste — copy rows of name/barcode, qty, paid, invoiced from Excel.", "error");
      return;
    }
    setMatchingPaste(true);
    try {
      const matched = await Promise.all(
        parsed.map(async (p) => {
          const hit = autoMatch(await fetchProductSearch(p.query).catch(() => []));
          const row: BulkRow = {
            ...emptyBulkRow(),
            name: hit ? hit.name : p.query,
            choice: hit ? { kind: "existing", product: hit } : null,
            quantity: p.quantity,
            unit_cost_paid: p.paid,
            unit_cost_invoiced: p.invoiced,
            pasted: true,
            error: hit ? undefined : "Not matched — choose a product or create a new one.",
          };
          return row;
        })
      );
      setRows((current) => withTrailingBlank([...current.filter((r) => !isBlankRow(r)), ...matched]));
      setPasteText("");
      setPasteOpen(false);
      const unmatched = matched.filter((r) => r.choice === null).length;
      show(
        unmatched === 0
          ? `${matched.length} rows pasted — review them, then save.`
          : `${matched.length} rows pasted — ${unmatched} need a product chosen before saving.`,
        unmatched === 0 ? "success" : "error"
      );
    } finally {
      setMatchingPaste(false);
    }
  }

  async function handleSave() {
    const candidates = rows.filter((r) => !isBlankRow(r));
    if (candidates.length === 0) return;

    const checked = candidates.map((r) => ({ row: r, error: validateBulkRow(r) }));
    if (checked.some((c) => c.error)) {
      const errorById = new Map(checked.map((c) => [c.row.id, c.error ?? undefined]));
      setRows((current) => current.map((r) => (errorById.has(r.id) ? { ...r, error: errorById.get(r.id) } : r)));
      show(`${checked.filter((c) => c.error).length} row(s) need attention — nothing was saved.`, "error");
      return;
    }

    try {
      const { items } = await bulkAdd.mutateAsync({ purchaseId, rows: candidates.map(buildBulkPayload) });
      const fresh: LabelToPrint[] = [];
      items.forEach((item, index) => {
        if (candidates[index]?.choice?.kind !== "new") return;
        fresh.push({
          key: `${item.purchase_item_id}`,
          name: item.product_name ?? "",
          barcode: item.product_barcode ?? "",
          retail_price: Number(item.product_retail_price ?? candidates[index].selling_price ?? 0),
          copies: item.quantity,
        });
      });
      setLabels(fresh);
      setRows([emptyBulkRow()]);
      onAdded();
      show(`${items.length} row${items.length === 1 ? "" : "s"} added.`, "success");
    } catch (error) {
      const rowErrors = bulkRowErrors(error);
      if (rowErrors) {
        const errorById = new Map<string, string>();
        Object.entries(rowErrors).forEach(([index, errors]) => {
          const row = candidates[Number(index)];
          if (row) errorById.set(row.id, describeRowError(errors));
        });
        setRows((current) => current.map((r) => (errorById.has(r.id) ? { ...r, error: errorById.get(r.id) } : r)));
        show(`${errorById.size} row(s) failed — nothing was saved. Fix them and save again.`, "error");
        return;
      }
      show(error instanceof ApiError ? extractErrorMessage(error.body) : "Something went wrong — try again.", "error");
    }
  }

  const labelCount = labels.reduce((sum, l) => sum + l.copies, 0);
  const filledCount = rows.filter((r) => !isBlankRow(r)).length;

  return (
    <div>
      {supplierId != null && recent.products.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-xs text-text/50 mr-1">Recent from this supplier:</span>
          {recent.products.map((p) => (
            <button
              key={p.product_id}
              type="button"
              onClick={() => addRecent(p)}
              className="text-xs py-1 px-2 rounded-full border border-divider hover:bg-text/[0.07]"
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-divider">
              <th className="text-left font-medium py-2 px-2 text-text/70 min-w-[220px]">Product</th>
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
              const isNew = row.choice?.kind === "new";
              const existing = row.choice?.kind === "existing" ? row.choice.product : null;
              const enter = (field: Exclude<Field, "product">) => (e: React.KeyboardEvent) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onFieldEnter(row.id, field);
                }
              };
              return (
                <tr key={row.id} className="border-b border-divider align-top">
                  <td className="py-1 px-2">
                    {row.choice === null ? (
                      <ProductCombobox
                        aria-label="Product name"
                        value={row.name}
                        onChange={(text) => updateRow(row.id, { name: text })}
                        onPick={(p) => pick(row.id, p)}
                        onCreateNew={(name) => createNew(row.id, name)}
                        inputProps={{ "data-row": row.id, "data-field": "product" }}
                      />
                    ) : (
                      <div className="flex items-center gap-2 min-h-8">
                        <span>
                          {isNew ? <span className="text-xs text-accent mr-1">New:</span> : null}
                          {row.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => clearChoice(row.id)}
                          className="text-xs text-text/50 underline"
                          aria-label={`Change product for ${row.name}`}
                        >
                          Change
                        </button>
                      </div>
                    )}
                    {row.error && <p className="text-xs text-red-400 mt-1">{row.error}</p>}
                  </td>
                  <td className="py-1 px-2">
                    {isNew ? (
                      <select
                        aria-label="Category"
                        value={row.category}
                        onChange={(e) => updateRow(row.id, { category: e.target.value === "" ? "" : Number(e.target.value) })}
                        className={inputClass}
                      >
                        <option value="">…</option>
                        {categories.map((c) => (
                          <option key={c.category_id} value={c.category_id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    ) : existing ? (
                      <span className="text-xs text-text/50">reused</span>
                    ) : null}
                  </td>
                  <td className="py-1 px-2 text-right">
                    <input
                      aria-label="Quantity"
                      inputMode="numeric"
                      data-row={row.id}
                      data-field="quantity"
                      value={row.quantity}
                      onChange={(e) => updateRow(row.id, { quantity: e.target.value })}
                      onKeyDown={enter("quantity")}
                      className={`${inputClass} text-right w-16`}
                    />
                  </td>
                  <td className="py-1 px-2 text-right">
                    <input
                      aria-label="Buy price paid"
                      inputMode="decimal"
                      data-row={row.id}
                      data-field="paid"
                      value={row.unit_cost_paid}
                      onChange={(e) => updateRow(row.id, { unit_cost_paid: e.target.value })}
                      onKeyDown={enter("paid")}
                      className={`${inputClass} text-right w-24`}
                    />
                  </td>
                  <td className="py-1 px-2 text-right">
                    <input
                      aria-label="Buy price invoiced"
                      inputMode="decimal"
                      data-row={row.id}
                      data-field="invoiced"
                      value={row.unit_cost_invoiced}
                      onChange={(e) => updateRow(row.id, { unit_cost_invoiced: e.target.value })}
                      onKeyDown={enter("invoiced")}
                      className={`${inputClass} text-right w-24`}
                    />
                  </td>
                  <td className="py-1 px-2 text-right">
                    <input
                      aria-label="Sell price"
                      inputMode="decimal"
                      value={row.selling_price}
                      onChange={(e) => updateRow(row.id, { selling_price: e.target.value })}
                      disabled={!isNew}
                      className={`${inputClass} text-right w-24 disabled:opacity-40`}
                    />
                  </td>
                  <td className="py-1 px-2">
                    <input
                      aria-label="Discrepancy note"
                      value={row.price_discrepancy_note}
                      onChange={(e) => updateRow(row.id, { price_discrepancy_note: e.target.value })}
                      placeholder="Required when paid ≠ invoiced"
                      className={`${inputClass} w-40`}
                    />
                  </td>
                  <td className="py-1 px-2 text-xs">
                    {existing ? (
                      <span className="font-mono">Existing · {existing.barcode}</span>
                    ) : isNew ? (
                      <span className="text-text/50">New product</span>
                    ) : row.name.trim() ? (
                      <span className="text-text/50">Choose a product</span>
                    ) : null}
                  </td>
                  <td className="py-1 px-2">
                    {!isBlankRow(row) && (
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
        Pick each product from the list as you type, or scan a barcode — Enter moves to quantity, paid, invoiced, then
        the next row. A new product is only created when you choose &ldquo;Create new&rdquo;. Rows are saved together:
        if one fails, none are saved.
      </p>

      {pasteOpen && (
        <div className="mt-3 flex flex-col gap-2">
          <label htmlFor={`paste-${purchaseId}`} className="text-xs text-text/70">
            Paste rows from Excel — columns: name or barcode, qty, paid, invoiced
          </label>
          <textarea
            id={`paste-${purchaseId}`}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={5}
            className="py-1.5 px-2.5 text-sm font-mono text-text bg-surface border border-divider rounded-md"
          />
          <div className="flex gap-2">
            <Button onClick={matchPaste} disabled={matchingPaste || pasteText.trim() === ""}>
              {matchingPaste ? "Matching…" : "Match pasted rows"}
            </Button>
            <Button variant="secondary" onClick={() => setPasteOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-end mt-3">
        {!pasteOpen && (
          <Button variant="secondary" onClick={() => setPasteOpen(true)}>
            Paste from Excel
          </Button>
        )}
        <Button variant="secondary" onClick={() => window.print()} disabled={labelCount === 0}>
          {labelCount > 0 ? `Print all new labels (${labelCount})` : "Print all new labels"}
        </Button>
        <Button onClick={handleSave} disabled={bulkAdd.isPending || filledCount === 0}>
          {bulkAdd.isPending
            ? "Saving…"
            : filledCount === 0
              ? "Save rows"
              : `Save ${filledCount} row${filledCount === 1 ? "" : "s"}`}
        </Button>
      </div>

      {labels.length > 0 && (
        <LabelSheet>
          {labels.flatMap((label) =>
            Array.from({ length: label.copies }, (_, i) => (
              <ProductLabel key={`${label.key}-${i}`} product={{ name: label.name, barcode: label.barcode, retail_price: label.retail_price }} />
            ))
          )}
        </LabelSheet>
      )}
    </div>
  );
}
