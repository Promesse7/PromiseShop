import { describe, expect, it } from "vitest";
import { findByBarcode, searchCatalog } from "./search";
import type { PosProduct } from "@/lib/types";
import type { PosCatalog } from "./usePosCatalog";

const products: PosProduct[] = [
  { product_id: 1, barcode: "PES-AUD-00147", name: "JBL Flip 6 Speaker", brand: "JBL", model_number: "JBLFLIP6BLK", category_name: "Audio", retail_price: 145000, quantity_in_stock: 2 },
  { product_id: 2, barcode: "PES-TV-00082", name: "Samsung 43\" Crystal UHD TV", brand: "Samsung", model_number: "UA43DU7000", category_name: "Televisions", retail_price: 385000, quantity_in_stock: 12 },
];

function makeCatalog(): PosCatalog {
  return {
    all: products,
    byBarcode: new Map(products.map((p) => [p.barcode, p])),
    isLoading: false,
    isError: false,
  };
}

describe("findByBarcode", () => {
  it("returns the exact match", () => {
    expect(findByBarcode(makeCatalog(), "PES-TV-00082")?.name).toBe('Samsung 43" Crystal UHD TV');
  });

  it("trims whitespace (scanners sometimes append a trailing newline)", () => {
    expect(findByBarcode(makeCatalog(), "PES-TV-00082\n")?.name).toBe('Samsung 43" Crystal UHD TV');
  });

  it("returns undefined for no match", () => {
    expect(findByBarcode(makeCatalog(), "UNKNOWN")).toBeUndefined();
  });
});

describe("searchCatalog", () => {
  it("matches by name substring, case-insensitively", () => {
    expect(searchCatalog(makeCatalog(), "jbl fli").map((p) => p.product_id)).toEqual([1]);
  });

  it("matches by brand", () => {
    expect(searchCatalog(makeCatalog(), "samsung").map((p) => p.product_id)).toEqual([2]);
  });

  it("matches by model number", () => {
    expect(searchCatalog(makeCatalog(), "ua43du7000").map((p) => p.product_id)).toEqual([2]);
  });

  it("returns an empty array for a blank query", () => {
    expect(searchCatalog(makeCatalog(), "  ")).toEqual([]);
  });

  it("returns an empty array for no match", () => {
    expect(searchCatalog(makeCatalog(), "xyz")).toEqual([]);
  });
});
