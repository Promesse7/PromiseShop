"use client";

import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAllPages, ApiError, extractErrorMessage } from "@/lib/api-client";
import { ProductCombobox } from "@/components/purchasing/ProductCombobox";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Card, CardKicker } from "@/components/ui/Card";
import { useToast } from "@/components/layout/ToastProvider";
import { allocationRemaining } from "@/lib/purchasing/lineKinds";
import {
  useAddPurchaseLine,
  useBundleSplitPreview,
  useBundleTemplates,
  type BundleComponentInput,
} from "@/lib/purchasing/useBundles";
import { formatRwf } from "@/lib/format";
import type { BundleTemplate, Category } from "@/lib/types";

interface AddBundleFormProps {
  purchaseId: number;
  supplierId?: number;
  onAdded: () => void;
}

type Choice = { kind: "existing"; productId: number; name: string } | { kind: "new"; name: string } | null;

interface ComponentRow {
  id: number;
  text: string;
  choice: Choice;
  category: string;
  sellingPrice: string;
  qty: string;
  paid: string;
  invoiced: string;
}

let nextRowId = 1;

function emptyRow(): ComponentRow {
  return { id: nextRowId++, text: "", choice: null, category: "", sellingPrice: "", qty: "1", paid: "", invoiced: "" };
}

function componentInput(row: ComponentRow): BundleComponentInput {
  const qty = Number(row.qty);
  if (row.choice?.kind === "existing") return { product: row.choice.productId, qty_per_bundle: qty };
  return {
    new_product: { category: Number(row.category), name: row.choice?.name ?? "", selling_price: row.sellingPrice || "0" },
    qty_per_bundle: qty,
  };
}

function remainingLabel(value: string): string {
  const n = Number(value);
  if (n === 0) return "fully allocated";
  return n > 0 ? `${formatRwf(n)} left to allocate` : `${formatRwf(Math.abs(n))} over`;
}

/**
 * A bundle line: one supplier package (e.g. a Canalbox TV kit = 1 TV + 20 decoders)
 * broken into components at receive, with the package price split across them.
 */
export function AddBundleForm({ purchaseId, supplierId, onAdded }: AddBundleFormProps) {
  const templateSelectId = useId();
  const { show } = useToast();
  const addLine = useAddPurchaseLine();
  const preview = useBundleSplitPreview();
  const templates = useBundleTemplates(supplierId);
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => fetchAllPages<Category>("categories/") });

  const [bundleName, setBundleName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [paid, setPaid] = useState("");
  const [invoiced, setInvoiced] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<ComponentRow[]>(() => [emptyRow()]);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invoicedTotal = invoiced === "" ? paid : invoiced;
  const remainingPaid = allocationRemaining(paid || "0", rows.map((r) => r.paid));
  const remainingInvoiced = allocationRemaining(invoicedTotal || "0", rows.map((r) => r.invoiced || r.paid));
  const unitsPerBundle = rows.reduce((n, r) => n + (Number(r.qty) || 0), 0);

  function updateRow(id: number, patch: Partial<ComponentRow>) {
    setRows((current) => current.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function applyTemplate(template: BundleTemplate | undefined) {
    if (!template) return;
    setBundleName(template.name);
    setRows(
      template.components.map((c) => ({
        ...emptyRow(),
        text: c.product_name,
        choice: { kind: "existing", productId: c.product, name: c.product_name },
        qty: String(c.qty_per_bundle),
      }))
    );
  }

  function componentsProblem(): string | null {
    if (rows.length === 0) return "Add at least one component.";
    for (const row of rows) {
      if (!row.choice) return "Choose a product for every component (or create it).";
      if (row.choice.kind === "new" && (!row.category || row.sellingPrice === "")) {
        return `New product "${row.choice.name}" needs a category and a selling price.`;
      }
      if (!(Number(row.qty) >= 1) || !Number.isInteger(Number(row.qty))) return "Each component needs a quantity of at least 1.";
    }
    const ids = rows.flatMap((r) => (r.choice?.kind === "existing" ? [r.choice.productId] : []));
    if (new Set(ids).size !== ids.length) return "Each product can appear only once in a bundle.";
    return null;
  }

  async function handleDefaultSplit() {
    const problem = componentsProblem() ?? (paid === "" ? "Enter the bundle price first." : null);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    try {
      const result = await preview.mutateAsync({
        unit_cost_paid: paid,
        unit_cost_invoiced: invoicedTotal,
        components: rows.map(componentInput),
      });
      setRows((current) =>
        current.map((row, index) => ({
          ...row,
          paid: result.components[index]?.allocated_paid_cost ?? row.paid,
          invoiced: result.components[index]?.allocated_invoiced_cost ?? row.invoiced,
        }))
      );
    } catch (err) {
      setError(err instanceof ApiError ? extractErrorMessage(err.body) : "Couldn't work out the split — try again.");
    }
  }

  function validate(): string | null {
    if (!bundleName.trim()) return "Name the bundle.";
    if (!(Number(quantity) >= 1) || !Number.isInteger(Number(quantity))) return "Enter how many bundles.";
    if (paid === "" || Number(paid) < 0) return "Enter the price paid per bundle.";
    const problem = componentsProblem();
    if (problem) return problem;
    const paidShares = rows.filter((r) => r.paid !== "").length;
    if (paidShares > 0 && paidShares < rows.length) return "Fill every component's share, or clear them all for the default split.";
    if (paidShares === rows.length && Number(remainingPaid) !== 0) return `Shares must add up to the bundle price (${remainingLabel(remainingPaid)}).`;
    if (Number(invoicedTotal) !== Number(paid) && !note.trim()) return "Add a note: paid and invoiced differ.";
    if (saveAsTemplate && !templateName.trim() && !bundleName.trim()) return "Name the template.";
    return null;
  }

  async function handleSubmit() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    const allShares = rows.every((r) => r.paid !== "");
    const components = rows.map((row) => ({
      ...componentInput(row),
      ...(allShares ? { allocated_paid_cost: row.paid, allocated_invoiced_cost: row.invoiced || row.paid } : {}),
    }));
    try {
      await addLine.mutateAsync({
        purchaseId,
        payload: {
          line_kind: "bundle",
          bundle_name: bundleName.trim(),
          quantity: Number(quantity),
          unit_cost_paid: paid,
          unit_cost_invoiced: invoicedTotal,
          price_discrepancy_note: note.trim(),
          components,
          save_as_template: saveAsTemplate,
          template_name: templateName.trim() || bundleName.trim(),
        },
      });
      show(`Bundle added — ${Number(quantity) * unitsPerBundle} units across ${rows.length} products.`, "success");
      setBundleName(""); setQuantity("1"); setPaid(""); setInvoiced(""); setNote("");
      setRows([emptyRow()]); setSaveAsTemplate(false); setTemplateName("");
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? extractErrorMessage(err.body) : "Something went wrong — try again.");
    }
  }

  return (
    <Card elevation="md">
      <CardKicker>Bundle — one supplier package, several products</CardKicker>
      <div className="flex flex-col gap-3">
        {(templates.data ?? []).length > 0 && (
          <div className="flex flex-col gap-1 max-w-sm">
            <label htmlFor={templateSelectId} className="text-xs text-text/70">Start from a template</label>
            <select
              id={templateSelectId}
              defaultValue=""
              onChange={(e) => applyTemplate(templates.data?.find((t) => String(t.template_id) === e.target.value))}
              className="min-h-9 py-1.5 px-2.5 text-sm bg-surface border border-divider rounded-md"
            >
              <option value="">Choose a template…</option>
              {(templates.data ?? []).map((t) => (
                <option key={t.template_id} value={t.template_id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Bundle name" name="bundle_name" value={bundleName} onChange={setBundleName} />
          <Field label="Bundles" name="bundles" type="number" value={quantity} onChange={setQuantity} />
          <Field label="Paid / bundle" name="paid" type="number" value={paid} onChange={setPaid} />
          <Field label="Invoiced / bundle" name="invoiced" type="number" value={invoiced} onChange={setInvoiced} placeholder="same as paid" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-divider text-left text-text/70">
                <th className="py-2 px-2 font-medium">Component</th>
                <th className="py-2 px-2 font-medium w-24">Qty / bundle</th>
                <th className="py-2 px-2 font-medium w-36">Paid share</th>
                <th className="py-2 px-2 font-medium w-36">Invoiced share</th>
                <th className="py-2 px-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id} className="border-b border-divider align-top">
                  <td className="py-2 px-2">
                    {row.choice ? (
                      <div className="flex flex-col gap-1">
                        <span>
                          {row.choice.name}
                          {row.choice.kind === "new" && <span className="text-xs text-text/50"> (new)</span>}
                          <Button variant="ghost" className="text-xs ml-1" onClick={() => updateRow(row.id, { choice: null })}>
                            Change
                          </Button>
                        </span>
                        {row.choice.kind === "new" && (
                          <div className="flex gap-2">
                            <select
                              aria-label={`Category for component ${index + 1}`}
                              value={row.category}
                              onChange={(e) => updateRow(row.id, { category: e.target.value })}
                              className="min-h-8 py-1 px-2 text-xs bg-surface border border-divider rounded-md"
                            >
                              <option value="">Category…</option>
                              {(categories.data ?? []).map((c) => (
                                <option key={c.category_id} value={c.category_id}>{c.name}</option>
                              ))}
                            </select>
                            <input
                              aria-label={`Selling price for component ${index + 1}`}
                              type="number"
                              placeholder="Selling price"
                              value={row.sellingPrice}
                              onChange={(e) => updateRow(row.id, { sellingPrice: e.target.value })}
                              className="min-h-8 w-32 py-1 px-2 text-xs bg-surface border border-divider rounded-md"
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <ProductCombobox
                        aria-label={`Component ${index + 1}`}
                        value={row.text}
                        onChange={(text) => updateRow(row.id, { text })}
                        onPick={(product) =>
                          updateRow(row.id, { choice: { kind: "existing", productId: product.product_id, name: product.name } })
                        }
                        onCreateNew={(name) => updateRow(row.id, { choice: { kind: "new", name } })}
                      />
                    )}
                  </td>
                  <td className="py-2 px-2">
                    <input
                      aria-label={`Quantity per bundle for component ${index + 1}`}
                      type="number"
                      value={row.qty}
                      onChange={(e) => updateRow(row.id, { qty: e.target.value })}
                      className="min-h-8 w-20 py-1 px-2 text-sm bg-surface border border-divider rounded-md"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      aria-label={`Paid share for component ${index + 1}`}
                      type="number"
                      value={row.paid}
                      placeholder="default"
                      onChange={(e) => updateRow(row.id, { paid: e.target.value })}
                      className="min-h-8 w-32 py-1 px-2 text-sm bg-surface border border-divider rounded-md"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      aria-label={`Invoiced share for component ${index + 1}`}
                      type="number"
                      value={row.invoiced}
                      placeholder="= paid share"
                      onChange={(e) => updateRow(row.id, { invoiced: e.target.value })}
                      className="min-h-8 w-32 py-1 px-2 text-sm bg-surface border border-divider rounded-md"
                    />
                  </td>
                  <td className="py-2 px-2 text-right">
                    {rows.length > 1 && (
                      <Button variant="ghost" className="text-xs" onClick={() => setRows((c) => c.filter((r) => r.id !== row.id))}>
                        Remove
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Button variant="secondary" onClick={() => setRows((c) => [...c, emptyRow()])}>+ Component</Button>
          <Button variant="secondary" onClick={handleDefaultSplit} disabled={preview.isPending}>
            {preview.isPending ? "Splitting…" : "Default split"}
          </Button>
          <span className="text-text/70" aria-live="polite">
            Paid: {remainingLabel(remainingPaid)} · Invoiced: {remainingLabel(remainingInvoiced)}
          </span>
        </div>
        <p className="text-xs text-text/50">
          Leave the shares blank to split by retail price automatically. Each bundle brings {unitsPerBundle} units into stock.
        </p>

        <Field label="Discrepancy note" name="note" value={note} onChange={setNote} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={saveAsTemplate} onChange={(e) => setSaveAsTemplate(e.target.checked)} />
          Save as template
        </label>
        {saveAsTemplate && (
          <Field label="Template name" name="template_name" value={templateName} onChange={setTemplateName} placeholder={bundleName} />
        )}
        {error && <p className="text-xs text-red-500" role="alert">{error}</p>}
        <div>
          <Button onClick={handleSubmit} disabled={addLine.isPending}>
            {addLine.isPending ? "Adding…" : "Add bundle line"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
