"use client";

import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
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
import { normalizeName } from "@/lib/products/normalizeName";
import type { Category, Product } from "@/lib/types";
import type { CatalogProduct } from "@/lib/products/useCatalogProducts";

interface ProductFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  categories: Category[];
  existingProducts?: CatalogProduct[];
  initialProduct?: Product;
  initialStorageLocation?: string | null;
  inventoryId?: number;
  onClose: () => void;
  onSaved: () => void;
}

export function ProductFormDialog({ open, onClose, ...rest }: ProductFormDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={rest.mode === "create" ? "New product" : "Edit product"}>
      {open && (
        <ProductFormFields
          key={`${rest.mode}-${rest.initialProduct?.product_id ?? "new"}`}
          onClose={onClose}
          {...rest}
        />
      )}
    </Dialog>
  );
}

function ProductFormFields({
  mode,
  categories,
  existingProducts = [],
  initialProduct,
  initialStorageLocation,
  inventoryId,
  onClose,
  onSaved,
}: Omit<ProductFormDialogProps, "open">) {
  const categoryId = useId();
  const { show } = useToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<ProductFormValues>(() =>
    mode === "edit" && initialProduct
      ? productFormValuesFromProduct(initialProduct, initialStorageLocation ?? null)
      : emptyProductFormValues()
  );
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const showStorageLocation = mode === "edit" && initialStorageLocation != null;
  const similarProduct =
    mode === "create" && values.name.trim()
      ? existingProducts.find((p) => normalizeName(p.name) === normalizeName(values.name))
      : undefined;

  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryCode, setNewCategoryCode] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [newCategoryErrors, setNewCategoryErrors] = useState<{ name?: string; code?: string }>({});
  const [creatingCategory, setCreatingCategory] = useState(false);

  function setField<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function resetNewCategoryForm() {
    setAddingCategory(false);
    setNewCategoryName("");
    setNewCategoryCode("");
    setNewCategoryDescription("");
    setNewCategoryErrors({});
  }

  async function handleCreateCategory() {
    const validationErrors: { name?: string; code?: string } = {};
    if (!newCategoryName.trim()) validationErrors.name = "Name is required.";
    if (!newCategoryCode.trim()) validationErrors.code = "Code is required.";
    if (Object.keys(validationErrors).length > 0) {
      setNewCategoryErrors(validationErrors);
      return;
    }
    setNewCategoryErrors({});
    setCreatingCategory(true);
    try {
      const category = await apiFetch<Category>("categories/", {
        method: "POST",
        body: JSON.stringify({
          name: newCategoryName.trim(),
          code: newCategoryCode.trim(),
          description: newCategoryDescription.trim() || null,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setField("category", category.category_id);
      resetNewCategoryForm();
      show("Category created.", "success");
    } catch (error) {
      // The backend wraps validation errors as { detail: { field: [messages] } } —
      // surface name/code errors inline since they map directly to fields in this sub-form.
      const detail = error instanceof ApiError && error.body && typeof error.body === "object"
        ? (error.body as { detail?: unknown }).detail
        : null;
      const fieldErrors: { name?: string; code?: string } = {};
      if (detail && typeof detail === "object") {
        const detailObj = detail as Record<string, unknown>;
        if (Array.isArray(detailObj.name)) fieldErrors.name = String(detailObj.name[0]);
        if (Array.isArray(detailObj.code)) fieldErrors.code = String(detailObj.code[0]);
      }
      if (Object.keys(fieldErrors).length > 0) {
        setNewCategoryErrors(fieldErrors);
      } else {
        const message =
          error instanceof ApiError ? extractErrorMessage(error.body) : "Something went wrong — try again.";
        show(message, "error");
      }
    } finally {
      setCreatingCategory(false);
    }
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
        queryClient.invalidateQueries({ queryKey: ["products"] });
      } else if (initialProduct) {
        await apiFetch<Product>(`products/${initialProduct.product_id}/`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        queryClient.invalidateQueries({ queryKey: ["products"] });
        if (showStorageLocation && inventoryId != null) {
          await apiFetch(`inventory/${inventoryId}/`, {
            method: "PATCH",
            body: JSON.stringify({ storage_location: values.storage_location }),
          });
          queryClient.invalidateQueries({ queryKey: ["inventory"] });
        }
      }
      show(mode === "create" ? "Product created." : "Product saved.", "success");
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
      <div className="flex flex-col gap-3 min-w-[420px]">
        <Field label="Name" name="name" value={values.name} onChange={(v) => setField("name", v)} error={errors.name} />
        {similarProduct && (
          <p className="text-xs text-text/50">
            A similar product already exists: {similarProduct.name} ({similarProduct.barcode})
          </p>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor={categoryId} className="block text-xs text-text/70">
            Category
          </label>
          {addingCategory ? (
            <div className="flex flex-col gap-2 p-2 border border-divider rounded-md">
              <Field
                label="Category name"
                name="new_category_name"
                value={newCategoryName}
                onChange={setNewCategoryName}
                error={newCategoryErrors.name}
              />
              <Field
                label="Category code"
                name="new_category_code"
                value={newCategoryCode}
                onChange={(v) => setNewCategoryCode(v.slice(0, 10))}
                placeholder="Barcode prefix, e.g. AUD"
                error={newCategoryErrors.code}
              />
              <div className="flex flex-col gap-1">
                <label className="block text-xs text-text/70">Category description</label>
                <input
                  value={newCategoryDescription}
                  onChange={(e) => setNewCategoryDescription(e.target.value)}
                  className="w-full min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="secondary" onClick={resetNewCategoryForm} disabled={creatingCategory}>
                  Cancel
                </Button>
                <Button variant="secondary" onClick={handleCreateCategory} disabled={creatingCategory}>
                  {creatingCategory ? "Adding…" : "Add category"}
                </Button>
              </div>
            </div>
          ) : (
            <select
              id={categoryId}
              value={values.category}
              disabled={mode === "edit"}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setAddingCategory(true);
                  return;
                }
                setField("category", e.target.value === "" ? "" : Number(e.target.value));
              }}
              className="w-full min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md disabled:opacity-60"
            >
              <option value="">Select a category…</option>
              {categories.map((c) => (
                <option key={c.category_id} value={c.category_id}>
                  {c.name}
                </option>
              ))}
              {mode === "create" && <option value="__new__">+ Add new category…</option>}
            </select>
          )}
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
        <div className="flex flex-col gap-1">
          <label className="block text-xs text-text/70">Tax category</label>
          <SegmentedToggle
            name="tax_category"
            options={[
              { value: "B", label: "Standard (18%)" },
              { value: "A", label: "Exempt (0%)" },
            ]}
            value={values.tax_category}
            onChange={(v) => setField("tax_category", v as "A" | "B")}
          />
        </div>
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
  );
}
