import { describe, expect, it } from "vitest";
import {
  emptyProductFormValues,
  productFormValuesFromProduct,
  buildProductPayload,
  validateProductForm,
} from "./productForm";
import type { Product } from "@/lib/types";

const product: Product = {
  product_id: 1, category: 20, barcode: "PES-AUD-00147", name: "JBL Flip 6", brand: "JBL",
  model_number: "JBLFLIP6BLK", description: null, specifications: "30W RMS",
  usage_instructions: "Hold power 2s.", warranty_months: 12, reorder_level: 4, unit: "pcs",
  tax_category: "B", is_active: true, created_at: "2026-01-01T00:00:00Z",
};

describe("emptyProductFormValues", () => {
  it("returns all-blank values with no category selected", () => {
    expect(emptyProductFormValues()).toEqual({
      name: "", category: "", brand: "", model_number: "", description: "",
      specifications: "", usage_instructions: "", warranty_months: "", reorder_level: "",
      unit: "", tax_category: "B", storage_location: "",
    });
  });
});

describe("productFormValuesFromProduct", () => {
  it("converts a Product into form string values, substituting empty strings for null fields", () => {
    expect(productFormValuesFromProduct(product, "Shelf B2")).toEqual({
      name: "JBL Flip 6", category: 20, brand: "JBL", model_number: "JBLFLIP6BLK",
      description: "", specifications: "30W RMS", usage_instructions: "Hold power 2s.",
      warranty_months: "12", reorder_level: "4", unit: "pcs", tax_category: "B",
      storage_location: "Shelf B2",
    });
  });

  it("uses an empty string for storage_location when none is passed", () => {
    expect(productFormValuesFromProduct(product, null).storage_location).toBe("");
  });
});

describe("buildProductPayload", () => {
  it("includes category on create when one is selected", () => {
    const values = { ...emptyProductFormValues(), name: "New Item", category: 20 as number | "" };
    expect(buildProductPayload(values, "create")).toMatchObject({ name: "New Item", category: 20 });
  });

  it("omits category on edit even when set (immutable after creation)", () => {
    const values = { ...productFormValuesFromProduct(product, null) };
    const payload = buildProductPayload(values, "edit");
    expect(payload.category).toBeUndefined();
  });

  it("converts blank optional text fields to null", () => {
    const values = { ...emptyProductFormValues(), name: "New Item", category: 20 as number | "" };
    const payload = buildProductPayload(values, "create");
    expect(payload.brand).toBeNull();
    expect(payload.model_number).toBeNull();
  });

  it("omits numeric fields left blank so the backend's own defaults apply", () => {
    const values = { ...emptyProductFormValues(), name: "New Item", category: 20 as number | "" };
    const payload = buildProductPayload(values, "create");
    expect(payload.warranty_months).toBeUndefined();
    expect(payload.reorder_level).toBeUndefined();
    expect(payload.unit).toBeUndefined();
  });

  it("includes numeric fields when provided", () => {
    const values = { ...emptyProductFormValues(), name: "New Item", category: 20 as number | "", warranty_months: "6", reorder_level: "10", unit: "box" };
    const payload = buildProductPayload(values, "create");
    expect(payload.warranty_months).toBe(6);
    expect(payload.reorder_level).toBe(10);
    expect(payload.unit).toBe("box");
  });

  it("always includes tax_category in the payload", () => {
    const values = { ...emptyProductFormValues(), name: "New Item", category: 20 as number | "", tax_category: "A" as const };
    const payload = buildProductPayload(values, "create");
    expect(payload.tax_category).toBe("A");
  });
});

describe("validateProductForm", () => {
  it("requires a name", () => {
    const errors = validateProductForm({ ...emptyProductFormValues(), category: 20 }, "create");
    expect(errors.name).toBeDefined();
  });

  it("requires a category on create", () => {
    const errors = validateProductForm({ ...emptyProductFormValues(), name: "New Item" }, "create");
    expect(errors.category).toBeDefined();
  });

  it("does not require category on edit", () => {
    const errors = validateProductForm({ ...emptyProductFormValues(), name: "Existing Item" }, "edit");
    expect(errors.category).toBeUndefined();
  });

  it("returns no errors for a valid create form", () => {
    const errors = validateProductForm({ ...emptyProductFormValues(), name: "New Item", category: 20 }, "create");
    expect(errors).toEqual({});
  });
});
