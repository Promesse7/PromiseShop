"use client";

import { useEffect, useId, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/layout/ToastProvider";
import { apiFetch, ApiError, extractErrorMessage } from "@/lib/api-client";
import {
  emptyProductFormValues,
  productFormValuesFromProduct,
  buildProductPayload,
  validateProductForm,
  type ProductFormValues,
  type ProductFormErrors,
} from "@/lib/products/productForm";
import type { Category, Product } from "@/lib/types";

interface ProductFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  categories: Category[];
  initialProduct?: Product;
  initialStorageLocation?: string | null;
  inventoryId?: number;
  onClose: () => void;
  onSaved: () => void;
}

export function ProductFormDialog({
  open,
  mode,
  categories,
  initialProduct,
  initialStorageLocation,
  inventoryId,
  onClose,
  onSaved,
}: ProductFormDialogProps) {
  const categoryId = useId();
  const { show } = useToast();
  const [values, setValues] = useState<ProductFormValues>(emptyProductFormValues());
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const showStorageLocation = mode === "edit" && initialStorageLocation != null;

  useEffect(() => {
    if (mode === "edit" && initialProduct) {
      setValues(productFormValuesFromProduct(initialProduct, initialStorageLocation ?? null));
    } else {
      setValues(emptyProductFormValues());
    }
    setErrors({});
  }, [mode, initialProduct, initialStorageLocation, open]);

  function setField<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit() {
    const validationErrors = validateProductForm(values, mode);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const payload = buildProductPayload(values, mode);
      if (mode === "create") {
        await apiFetch<Product>("products/", { method: "POST", body: JSON.stringify(payload) });
      } else if (initialProduct) {
        await apiFetch<Product>(`products/${initialProduct.product_id}/`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        if (showStorageLocation && inventoryId != null) {
          await apiFetch(`inventory/${inventoryId}/`, {
            method: "PATCH",
            body: JSON.stringify({ storage_location: values.storage_location }),
          });
        }
      }
      onSaved();
    } catch (error) {
      const message =
        error instanceof ApiError ? extractErrorMessage(error.body) : "Something went wrong — try again.";
      show(message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={mode === "create" ? "New product" : "Edit product"}>
      <div className="flex flex-col gap-3 min-w-[420px]">
        <Field label="Name" name="name" value={values.name} onChange={(v) => setField("name", v)} error={errors.name} />
        <div className="flex flex-col gap-1">
          <label htmlFor={categoryId} className="block text-xs text-text/70">
            Category
          </label>
          <select
            id={categoryId}
            value={values.category}
            disabled={mode === "edit"}
            onChange={(e) => setField("category", e.target.value === "" ? "" : Number(e.target.value))}
            className="w-full min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md disabled:opacity-60"
          >
            <option value="">Select a category…</option>
            {categories.map((c) => (
              <option key={c.category_id} value={c.category_id}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.category && <p className="text-xs text-red-400">{errors.category}</p>}
        </div>
        <Field label="Brand" name="brand" value={values.brand} onChange={(v) => setField("brand", v)} />
        <Field label="Model number" name="model_number" value={values.model_number} onChange={(v) => setField("model_number", v)} />
        <Field label="Description" name="description" value={values.description} onChange={(v) => setField("description", v)} />
        <div className="flex flex-col gap-1">
          <label className="block text-xs text-text/70">Specifications</label>
          <textarea
            value={values.specifications}
            onChange={(e) => setField("specifications", e.target.value)}
            className="w-full min-h-[56px] py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="block text-xs text-text/70">How it works / usage</label>
          <textarea
            value={values.usage_instructions}
            onChange={(e) => setField("usage_instructions", e.target.value)}
            className="w-full min-h-[56px] py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md"
          />
        </div>
        <Field label="Warranty (months)" name="warranty_months" type="number" value={values.warranty_months} onChange={(v) => setField("warranty_months", v)} />
        <Field label="Reorder level" name="reorder_level" type="number" value={values.reorder_level} onChange={(v) => setField("reorder_level", v)} />
        <Field label="Unit" name="unit" value={values.unit} onChange={(v) => setField("unit", v)} />
        {showStorageLocation && (
          <Field
            label="Storage location"
            name="storage_location"
            value={values.storage_location}
            onChange={(v) => setField("storage_location", v)}
          />
        )}
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
