import { describe, expect, it } from "vitest";
import { deriveWorkflowHints } from "./workflowHints";
import type { CatalogProduct } from "@/lib/products/useCatalogProducts";
import type { PurchaseListRow } from "@/lib/purchasing/usePurchases";

const NOW = new Date("2026-09-05T12:00:00Z");

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    product_id: 1, name: "Samsung TV", brand: "Samsung", model_number: "UA43", barcode: "PES-TV-00001",
    category_id: 10, category_name: "Televisions", retail_price: 385000, wholesale_price: null,
    quantity_in_stock: 12, reorder_level: 5, status: "ok", is_active: true, has_price: true, has_inventory: true,
    ...overrides,
  };
}

function purchase(overrides: Partial<PurchaseListRow> = {}): PurchaseListRow {
  return {
    purchase_id: 1, supplier_name: "Kigali Electronics", invoice_number: null, purchase_date: "2026-09-01",
    payment_status: "paid", status: "received",
    ...overrides,
  };
}

describe("deriveWorkflowHints — first-run setup", () => {
  it("lists the four setup steps, in order, until the first purchase is received", () => {
    const hints = deriveWorkflowHints({ products: [], categoryCount: 0, purchases: [], now: NOW });
    expect(hints.map((h) => [h.kind, h.label, h.href, h.done])).toEqual([
      ["setup", "Add your first category", "/products", false],
      ["setup", "Add your first product", "/products", false],
      ["setup", "Set a selling price on a product", "/products", false],
      ["setup", "Record and receive your first purchase", "/purchases?open=new", false],
    ]);
  });

  it("ticks the steps that are already done", () => {
    const hints = deriveWorkflowHints({
      products: [product({ has_price: true, has_inventory: false })],
      categoryCount: 1,
      purchases: [purchase({ status: "draft" })],
      now: NOW,
    });
    expect(hints.map((h) => h.done)).toEqual([true, true, true, false]);
  });

  it("stops showing setup steps once a purchase has been received", () => {
    const hints = deriveWorkflowHints({ products: [product()], categoryCount: 1, purchases: [purchase()], now: NOW });
    expect(hints.filter((h) => h.kind === "setup")).toEqual([]);
  });
});

describe("deriveWorkflowHints — ongoing to-dos", () => {
  it("returns nothing when everything is in order", () => {
    expect(deriveWorkflowHints({ products: [product()], categoryCount: 1, purchases: [purchase()], now: NOW })).toEqual([]);
  });

  it("counts active products without a selling price", () => {
    const hints = deriveWorkflowHints({
      products: [product(), product({ product_id: 2, has_price: false }), product({ product_id: 3, has_price: false, is_active: false })],
      categoryCount: 1,
      purchases: [purchase()],
      now: NOW,
    });
    const hint = hints.find((h) => h.key === "needs-price");
    expect(hint).toMatchObject({ kind: "todo", label: "1 product needs a selling price", href: "/products", signature: "1" });
  });

  it("counts draft purchases and says how old the oldest is", () => {
    const hints = deriveWorkflowHints({
      products: [product()],
      categoryCount: 1,
      purchases: [purchase(), purchase({ purchase_id: 2, status: "draft", purchase_date: "2026-09-04" }), purchase({ purchase_id: 3, status: "draft", purchase_date: "2026-08-26" })],
      now: NOW,
    });
    const hint = hints.find((h) => h.key === "draft-purchases");
    expect(hint).toMatchObject({
      kind: "todo",
      label: "2 draft purchases waiting to be received — oldest 10 days ago",
      href: "/purchases",
      signature: "2",
    });
  });

  it("counts active products that have never been received into stock", () => {
    const hints = deriveWorkflowHints({
      products: [product(), product({ product_id: 2, has_inventory: false, quantity_in_stock: 0, status: "out_of_stock" })],
      categoryCount: 1,
      purchases: [purchase()],
      now: NOW,
    });
    const hint = hints.find((h) => h.key === "never-received");
    expect(hint).toMatchObject({ label: "1 product never received into stock", href: "/purchases?open=new" });
  });

  it("pluralises", () => {
    const hints = deriveWorkflowHints({
      products: [product({ has_price: false }), product({ product_id: 2, has_price: false })],
      categoryCount: 1,
      purchases: [purchase()],
      now: NOW,
    });
    expect(hints.find((h) => h.key === "needs-price")?.label).toBe("2 products need a selling price");
  });
});
