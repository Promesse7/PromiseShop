import { describe, expect, it } from "vitest";
import { findExactProduct, searchProducts } from "./searchProducts";
import type { Product } from "@/lib/types";

function product(overrides: Partial<Product> & Pick<Product, "product_id" | "name" | "barcode">): Product {
  return {
    category: 1, brand: null, model_number: null, description: null, specifications: null,
    usage_instructions: null, warranty_months: 0, reorder_level: 5, unit: "pcs", tax_category: "B",
    is_active: true, created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const catalog: Product[] = [
  product({ product_id: 1, name: "Scales 60kg", barcode: "PES-HOM-00060" }),
  product({ product_id: 2, name: "Scales 300kg", barcode: "PES-HOM-00300" }),
  product({ product_id: 3, name: "Boya BY-M1 Microphone", barcode: "PES-AUD-00121" }),
];

describe("searchProducts", () => {
  it("matches a partial name, case-insensitively, returning every match", () => {
    expect(searchProducts(catalog, "sc").map((p) => p.product_id)).toEqual([1, 2]);
    expect(searchProducts(catalog, "SCALES 3").map((p) => p.product_id)).toEqual([2]);
  });

  it("collapses stray whitespace in the query", () => {
    expect(searchProducts(catalog, "  scales   60 ").map((p) => p.product_id)).toEqual([1]);
  });

  it("matches a barcode fragment", () => {
    expect(searchProducts(catalog, "aud-00121").map((p) => p.product_id)).toEqual([3]);
  });

  it("returns nothing for a blank query", () => {
    expect(searchProducts(catalog, "   ")).toEqual([]);
  });

  it("caps the result list at the limit (default 8)", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      product({ product_id: 100 + i, name: `Cable ${i}`, barcode: `PES-CAB-${i}` })
    );
    expect(searchProducts(many, "cable")).toHaveLength(8);
    expect(searchProducts(many, "cable", 3)).toHaveLength(3);
  });
});

describe("findExactProduct", () => {
  it("finds a product by its full name regardless of case and spacing", () => {
    expect(findExactProduct(catalog, "  scales  60KG ")?.product_id).toBe(1);
  });

  it("finds a product by its exact barcode regardless of case", () => {
    expect(findExactProduct(catalog, "pes-hom-00300")?.product_id).toBe(2);
  });

  it("does not treat a partial name as exact", () => {
    expect(findExactProduct(catalog, "scales")).toBeUndefined();
  });

  it("returns undefined for a blank query", () => {
    expect(findExactProduct(catalog, "")).toBeUndefined();
  });
});
