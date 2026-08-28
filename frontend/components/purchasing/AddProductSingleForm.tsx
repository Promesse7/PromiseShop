"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAllPages } from "@/lib/api-client";
import { normalizeName } from "@/lib/products/normalizeName";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Card, CardKicker } from "@/components/ui/Card";
import { useAddPurchaseItem } from "@/lib/purchasing/useAddPurchaseItem";
import { useToast } from "@/components/layout/ToastProvider";
import { ApiError, extractErrorMessage } from "@/lib/api-client";
import {
  emptyExistingProductItemValues,
  emptyNewProductItemValues,
  buildAddItemPayload,
  validateAddItemForm,
  type AddItemFormValues,
  type AddItemFormErrors,
  type AddItemMode,
} from "@/lib/purchasing/purchaseItemForm";
import type { Category, Product } from "@/lib/types";

interface AddProductSingleFormProps {
  purchaseId: number;
  onAdded: () => void;
  initialSearch?: string;
}

export function AddProductSingleForm({ purchaseId, onAdded, initialSearch }: AddProductSingleFormProps) {
  const categoryId = useId();
  const { show } = useToast();
  const addItem = useAddPurchaseItem();
  const productsQuery = useQuery({ queryKey: ["products"], queryFn: () => fetchAllPages<Product>("products/") });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: () => fetchAllPages<Category>("categories/") });

  const [search, setSearch] = useState(initialSearch ?? "");
  const [selected, setSelected] = useState<Product | null>(null);
  const [forceNew, setForceNew] = useState(false);
  const [values, setValues] = useState<AddItemFormValues>(emptyExistingProductItemValues(""));
  const [errors, setErrors] = useState<AddItemFormErrors>({});
  const [autoSelectAttempted, setAutoSelectAttempted] = useState(false);

  const matches = useMemo(() => {
    // Collapse repeated whitespace on both sides so a stray double space (a very easy typo)
    // doesn't hide an existing product and cause an accidental duplicate to get created.
    const q = search.trim().toLowerCase().replace(/\s+/g, " ");
    if (!q || !productsQuery.data) return [];
    return productsQuery.data
      .filter((p) => {
        const name = p.name.toLowerCase().replace(/\s+/g, " ");
        return name.includes(q) || p.barcode.toLowerCase().includes(q);
      })
      .slice(0, 8);
  }, [productsQuery.data, search]);

  useEffect(() => {
    if (autoSelectAttempted || !initialSearch || !productsQuery.data || selected || forceNew) return;
    setAutoSelectAttempted(true);
    const target = normalizeName(initialSearch);
    const exactMatches = productsQuery.data.filter((p) => normalizeName(p.name) === target);
    if (exactMatches.length === 1) {
      selectProduct(exactMatches[0]);
    }
  }, [autoSelectAttempted, initialSearch, productsQuery.data, selected, forceNew]);

  const mode: AddItemMode | null = selected ? "existing" : forceNew ? "new" : null;

  function selectProduct(product: Product) {
    setSelected(product);
    setForceNew(false);
    setValues(emptyExistingProductItemValues(product.product_id));
    setErrors({});
  }

  function startNewProduct() {
    setSelected(null);
    setForceNew(true);
    setValues(emptyNewProductItemValues(search.trim()));
    setErrors({});
  }

  function reset() {
    setSearch("");
    setSelected(null);
    setForceNew(false);
    setValues(emptyExistingProductItemValues(""));
    setErrors({});
  }

  function setField<K extends keyof AddItemFormValues>(key: K, value: AddItemFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit() {
    if (!mode) return;
    const validationErrors = validateAddItemForm(values, mode);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    try {
      await addItem.mutateAsync({ purchaseId, payload: buildAddItemPayload(values, mode) });
      show("Item added to purchase.", "success");
      reset();
      onAdded();
    } catch (error) {
      const message =
        error instanceof ApiError ? extractErrorMessage(error.body) : "Something went wrong — try again.";
      show(message, "error");
    }
  }

  return (
    <Card elevation="md">
      <CardKicker>{mode === "new" ? "New product — not in catalog" : "Add product"}</CardKicker>

      {!mode && (
        <>
          <input
            aria-label="Search catalog first — reuse if it exists…"
            placeholder="Search catalog first — reuse if it exists…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md"
          />
          {matches.length > 0 && (
            <div className="flex flex-col gap-1">
              {matches.map((p) => (
                <button
                  key={p.product_id}
                  type="button"
                  onClick={() => selectProduct(p)}
                  className="text-left text-sm py-1.5 px-2 hover:bg-text/[0.07] rounded-md"
                >
                  {p.name} <span className="text-xs font-mono text-text/50">{p.barcode}</span>
                </button>
              ))}
            </div>
          )}
          {search.trim() && matches.length === 0 && (
            <p className="text-sm text-text/50">
              No matches for &quot;{search.trim()}&quot; in the catalog — double-check the spelling
              before adding it as new, to avoid creating a duplicate.
            </p>
          )}
          {search.trim() && (
            <button type="button" onClick={startNewProduct} className="text-left text-sm text-accent">
              + Add &quot;{search.trim()}&quot; as a new product
            </button>
          )}
        </>
      )}

      {mode === "existing" && selected && (
        <>
          <div className="text-sm">
            {selected.name}{" "}
            <button type="button" onClick={reset} className="text-xs text-accent ml-2">
              change
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Quantity" name="quantity" type="number" value={values.quantity} onChange={(v) => setField("quantity", v)} error={errors.quantity} />
            <Field label="Buying price — paid / unit" name="unit_cost_paid" type="number" value={values.unit_cost_paid} onChange={(v) => setField("unit_cost_paid", v)} error={errors.unit_cost_paid} />
            <Field label="Buying price — on invoice / unit" name="unit_cost_invoiced" type="number" value={values.unit_cost_invoiced} onChange={(v) => setField("unit_cost_invoiced", v)} error={errors.unit_cost_invoiced} />
          </div>
          <Field
            label="Discrepancy note (required when paid ≠ invoiced)"
            name="price_discrepancy_note"
            value={values.price_discrepancy_note}
            onChange={(v) => setField("price_discrepancy_note", v)}
            error={errors.price_discrepancy_note}
          />
        </>
      )}

      {mode === "new" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Product name" name="name" value={values.name} onChange={(v) => setField("name", v)} error={errors.name} />
            <Field label="Brand" name="brand" value={values.brand} onChange={(v) => setField("brand", v)} />
            <Field label="Model number" name="model_number" value={values.model_number} onChange={(v) => setField("model_number", v)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={categoryId} className="block text-xs text-text/70">
                Category
              </label>
              <select
                id={categoryId}
                value={values.category}
                onChange={(e) => setField("category", e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md"
              >
                <option value="">Select a category…</option>
                {(categoriesQuery.data ?? []).map((c) => (
                  <option key={c.category_id} value={c.category_id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.category && <p className="text-xs text-red-400">{errors.category}</p>}
            </div>
            <Field label="Warranty (months)" name="warranty_months" type="number" value={values.warranty_months} onChange={(v) => setField("warranty_months", v)} />
            <Field label="Reorder level" name="reorder_level" type="number" value={values.reorder_level} onChange={(v) => setField("reorder_level", v)} />
          </div>
          <Field label="Specifications" name="specifications" value={values.specifications} onChange={(v) => setField("specifications", v)} />
          <div className="flex flex-col gap-1">
            <label className="block text-xs text-text/70">How it works / usage (staff &amp; customer info sheet)</label>
            <textarea
              value={values.usage_instructions}
              onChange={(e) => setField("usage_instructions", e.target.value)}
              className="w-full min-h-[56px] py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md"
            />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Field label="Quantity" name="quantity" type="number" value={values.quantity} onChange={(v) => setField("quantity", v)} error={errors.quantity} />
            <Field label="Buying price — paid / unit" name="unit_cost_paid" type="number" value={values.unit_cost_paid} onChange={(v) => setField("unit_cost_paid", v)} error={errors.unit_cost_paid} />
            <Field label="Buying price — on invoice / unit" name="unit_cost_invoiced" type="number" value={values.unit_cost_invoiced} onChange={(v) => setField("unit_cost_invoiced", v)} error={errors.unit_cost_invoiced} />
            <Field label="Selling price / unit" name="selling_price" type="number" value={values.selling_price} onChange={(v) => setField("selling_price", v)} error={errors.selling_price} />
          </div>
          <Field
            label="Discrepancy note (required when paid ≠ invoiced)"
            name="price_discrepancy_note"
            value={values.price_discrepancy_note}
            onChange={(v) => setField("price_discrepancy_note", v)}
            error={errors.price_discrepancy_note}
          />
          <p className="text-xs text-text/50">
            Shop barcode is assigned automatically once this item is added — shown in the list
            below, not previewed here.
          </p>
        </>
      )}

      {mode && (
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={reset}>
            Clear
          </Button>
          <Button onClick={handleSubmit} disabled={addItem.isPending}>
            {addItem.isPending ? "Adding…" : "Add to purchase"}
          </Button>
        </div>
      )}
    </Card>
  );
}
