import type { Product } from "@/lib/types";

export interface ProductFormValues {
  name: string;
  category: number | "";
  brand: string;
  model_number: string;
  description: string;
  specifications: string;
  usage_instructions: string;
  warranty_months: string;
  reorder_level: string;
  unit: string;
  tax_category: "A" | "B";
  storage_location: string;
}

export function emptyProductFormValues(): ProductFormValues {
  return {
    name: "", category: "", brand: "", model_number: "", description: "",
    specifications: "", usage_instructions: "", warranty_months: "", reorder_level: "",
    unit: "", tax_category: "B", storage_location: "",
  };
}

export function productFormValuesFromProduct(
  product: Product,
  storageLocation: string | null
): ProductFormValues {
  return {
    name: product.name,
    category: product.category,
    brand: product.brand ?? "",
    model_number: product.model_number ?? "",
    description: product.description ?? "",
    specifications: product.specifications ?? "",
    usage_instructions: product.usage_instructions ?? "",
    warranty_months: product.warranty_months != null ? String(product.warranty_months) : "",
    reorder_level: String(product.reorder_level),
    unit: product.unit,
    tax_category: product.tax_category,
    storage_location: storageLocation ?? "",
  };
}

export interface ProductPayload {
  name: string;
  category?: number;
  brand: string | null;
  model_number: string | null;
  description: string | null;
  specifications: string | null;
  usage_instructions: string | null;
  warranty_months?: number;
  reorder_level?: number;
  unit?: string;
  tax_category?: "A" | "B";
}

export function buildProductPayload(
  values: ProductFormValues,
  mode: "create" | "edit"
): ProductPayload {
  const payload: ProductPayload = {
    name: values.name.trim(),
    brand: values.brand.trim() || null,
    model_number: values.model_number.trim() || null,
    description: values.description.trim() || null,
    specifications: values.specifications.trim() || null,
    usage_instructions: values.usage_instructions.trim() || null,
    tax_category: values.tax_category,
  };
  if (mode === "create" && values.category !== "") {
    payload.category = values.category;
  }
  if (values.warranty_months.trim() !== "") {
    payload.warranty_months = Number(values.warranty_months);
  }
  if (values.reorder_level.trim() !== "") {
    payload.reorder_level = Number(values.reorder_level);
  }
  if (values.unit.trim() !== "") {
    payload.unit = values.unit.trim();
  }
  return payload;
}

export type ProductFormErrors = Partial<Record<"name" | "category", string>>;

export function validateProductForm(
  values: ProductFormValues,
  mode: "create" | "edit"
): ProductFormErrors {
  const errors: ProductFormErrors = {};
  if (!values.name.trim()) {
    errors.name = "Name is required.";
  }
  if (mode === "create" && values.category === "") {
    errors.category = "Category is required.";
  }
  return errors;
}
