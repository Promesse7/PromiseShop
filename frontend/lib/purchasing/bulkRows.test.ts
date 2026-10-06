import { describe, expect, it } from "vitest";
import {
  autoMatch,
  buildBulkPayload,
  didYouMean,
  emptyBulkRow,
  isBlankRow,
  normaliseText,
  parsePastedRows,
  validateBulkRow,
  type BulkRow,
} from "./bulkRows";
import type { ProductSearchResult } from "@/lib/types";

function result(overrides: Partial<ProductSearchResult>): ProductSearchResult {
  return {
    product_id: 1, name: "JBL Flip 6", brand: "JBL", model_number: "", barcode: "PES-AUD-00001",
    category: 1, category_name: "Audio", is_active: true, in_stock: 3, retail_price: "145000.00",
    match: "similar", score: 0.5, ...overrides,
  };
}

function row(overrides: Partial<BulkRow>): BulkRow {
  return { ...emptyBulkRow(), ...overrides };
}

describe("normaliseText", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normaliseText("  JBL   Flip\t6 ")).toBe("jbl flip 6");
  });
});

describe("autoMatch", () => {
  it("auto-selects only an exact barcode or exact name hit", () => {
    expect(autoMatch([result({ match: "barcode" })])?.product_id).toBe(1);
    expect(autoMatch([result({ match: "exact_name" })])?.product_id).toBe(1);
    expect(autoMatch([result({ match: "starts_with", score: 0.9 })])).toBeNull();
    expect(autoMatch([result({ match: "similar", score: 0.99 })])).toBeNull();
    expect(autoMatch([])).toBeNull();
  });
});

describe("didYouMean", () => {
  it("returns the best match scoring at least 0.6", () => {
    expect(didYouMean([result({ score: 0.65 }), result({ product_id: 2, score: 0.9 })])?.product_id).toBe(2);
    expect(didYouMean([result({ score: 0.59 })])).toBeNull();
  });
});

describe("validateBulkRow", () => {
  const picked = result({ match: "exact_name" });

  it("refuses a row with no product chosen", () => {
    expect(validateBulkRow(row({ name: "Earbuds", quantity: "1", unit_cost_paid: "1", unit_cost_invoiced: "1" })))
      .toMatch(/choose a product/i);
  });

  it("accepts an existing product with valid numbers", () => {
    expect(
      validateBulkRow(row({ choice: { kind: "existing", product: picked }, quantity: "2", unit_cost_paid: "5", unit_cost_invoiced: "5" }))
    ).toBeNull();
  });

  it("needs category and selling price for a new product", () => {
    const base = row({ name: "Earbuds", choice: { kind: "new" }, quantity: "1", unit_cost_paid: "1", unit_cost_invoiced: "1" });
    expect(validateBulkRow(base)).toMatch(/category/i);
    expect(validateBulkRow({ ...base, category: 3 })).toMatch(/selling price/i);
    expect(validateBulkRow({ ...base, category: 3, selling_price: "2" })).toBeNull();
  });

  it("checks quantity, costs and the discrepancy note", () => {
    const base = row({ choice: { kind: "existing", product: picked }, quantity: "1", unit_cost_paid: "5", unit_cost_invoiced: "5" });
    expect(validateBulkRow({ ...base, quantity: "0" })).toMatch(/quantity/i);
    expect(validateBulkRow({ ...base, quantity: "1.5" })).toMatch(/quantity/i);
    expect(validateBulkRow({ ...base, unit_cost_paid: "" })).toMatch(/paid/i);
    expect(validateBulkRow({ ...base, unit_cost_invoiced: "-1" })).toMatch(/invoiced/i);
    expect(validateBulkRow({ ...base, unit_cost_invoiced: "6" })).toMatch(/note/i);
    expect(validateBulkRow({ ...base, unit_cost_invoiced: "6", price_discrepancy_note: "promo" })).toBeNull();
  });
});

describe("buildBulkPayload", () => {
  it("sends product for an existing row and new_product for a new one", () => {
    const existing = row({
      choice: { kind: "existing", product: result({ product_id: 7 }) },
      quantity: "2", unit_cost_paid: "5", unit_cost_invoiced: "6", price_discrepancy_note: "promo",
    });
    expect(buildBulkPayload(existing)).toEqual({
      product: 7, quantity: 2, unit_cost_paid: "5", unit_cost_invoiced: "6", price_discrepancy_note: "promo",
    });

    const created = row({
      name: "  Earbuds ", choice: { kind: "new" }, category: 3, selling_price: "15",
      quantity: "1", unit_cost_paid: "10", unit_cost_invoiced: "10",
    });
    expect(buildBulkPayload(created)).toEqual({
      new_product: { category: 3, name: "Earbuds", selling_price: "15" },
      quantity: 1, unit_cost_paid: "10", unit_cost_invoiced: "10", price_discrepancy_note: "",
    });
  });
});

describe("isBlankRow", () => {
  it("is blank when nothing was typed or chosen", () => {
    expect(isBlankRow(emptyBulkRow())).toBe(true);
    expect(isBlankRow(row({ quantity: "2" }))).toBe(false);
    expect(isBlankRow(row({ name: "x" }))).toBe(false);
  });
});

describe("parsePastedRows", () => {
  it("reads tab-separated name/barcode, qty, paid, invoiced and skips blank lines", () => {
    const text = "JBL Flip 6\t3\t100000\t105000\r\n\nPES-AUD-00002\t1\t5,000\t5000\n";
    expect(parsePastedRows(text)).toEqual([
      { query: "JBL Flip 6", quantity: "3", paid: "100000", invoiced: "105000" },
      { query: "PES-AUD-00002", quantity: "1", paid: "5000", invoiced: "5000" },
    ]);
  });

  it("defaults invoiced to paid when the column is missing", () => {
    expect(parsePastedRows("Kettle\t2\t300")).toEqual([{ query: "Kettle", quantity: "2", paid: "300", invoiced: "300" }]);
  });

  it("skips a header row", () => {
    expect(parsePastedRows("Name\tQty\tPaid\tInvoiced\nKettle\t2\t300\t300")).toHaveLength(1);
  });
});
