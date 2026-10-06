import { describe, expect, it } from "vitest";
import {
  addItem, setQuantity, setUnitPrice, setPriceNote, removeItem, lineSubtotal, totals, saleItemsPayload,
  type CartLine,
} from "./cart";
import type { PosProduct } from "@/lib/types";

function makeProduct(overrides: Partial<PosProduct> = {}): PosProduct {
  return {
    product_id: 1,
    barcode: "PES-AUD-00147",
    name: "JBL Flip 6 Speaker",
    brand: "JBL",
    model_number: "JBLFLIP6BLK",
    category_name: "Audio",
    retail_price: 145000,
    quantity_in_stock: 2,
    ...overrides,
  };
}

function makeLine(product: PosProduct, quantity: number, unitPrice = product.retail_price): CartLine {
  return { product, quantity, unitPrice };
}

describe("addItem", () => {
  it("adds a new product as a line with quantity 1 priced at the catalog price", () => {
    const result = addItem([], makeProduct());
    expect(result).toEqual([{ product: makeProduct(), quantity: 1, unitPrice: 145000 }]);
  });

  it("increments quantity when the product is already in the cart", () => {
    const existing: CartLine[] = [makeLine(makeProduct(), 1)];
    const result = addItem(existing, makeProduct());
    expect(result).toEqual([{ product: makeProduct(), quantity: 2, unitPrice: 145000 }]);
  });

  it("keeps a line's overridden price when the same product is scanned again", () => {
    const existing: CartLine[] = [makeLine(makeProduct(), 1, 120000)];
    const result = addItem(existing, makeProduct());
    expect(result[0]).toEqual({ product: makeProduct(), quantity: 2, unitPrice: 120000 });
  });

  it("does not mutate the input array", () => {
    const existing: CartLine[] = [];
    addItem(existing, makeProduct());
    expect(existing).toEqual([]);
  });
});

describe("setQuantity", () => {
  it("updates the quantity of the matching line", () => {
    const lines: CartLine[] = [makeLine(makeProduct(), 1)];
    const result = setQuantity(lines, 1, 5);
    expect(result[0].quantity).toBe(5);
  });

  it("removes the line when quantity is set to 0 or less", () => {
    const lines: CartLine[] = [makeLine(makeProduct(), 1)];
    expect(setQuantity(lines, 1, 0)).toEqual([]);
    expect(setQuantity(lines, 1, -1)).toEqual([]);
  });

  it("leaves other lines untouched", () => {
    const other = makeProduct({ product_id: 2, barcode: "PES-TV-00082", name: "TV" });
    const lines: CartLine[] = [makeLine(makeProduct(), 1), makeLine(other, 3)];
    const result = setQuantity(lines, 1, 5);
    expect(result.find((l) => l.product.product_id === 2)?.quantity).toBe(3);
  });
});

describe("setUnitPrice", () => {
  it("changes the price of the matching line only, leaving the catalog price on the product intact", () => {
    const other = makeProduct({ product_id: 2, barcode: "PES-TV-00082", name: "TV", retail_price: 385000 });
    const lines: CartLine[] = [makeLine(makeProduct(), 1), makeLine(other, 1)];
    const result = setUnitPrice(lines, 1, 120000);
    expect(result[0].unitPrice).toBe(120000);
    expect(result[0].product.retail_price).toBe(145000);
    expect(result[1].unitPrice).toBe(385000);
  });

  it("does not mutate the input array", () => {
    const lines: CartLine[] = [makeLine(makeProduct(), 1)];
    setUnitPrice(lines, 1, 120000);
    expect(lines[0].unitPrice).toBe(145000);
  });
});

describe("removeItem", () => {
  it("removes the matching line", () => {
    const lines: CartLine[] = [makeLine(makeProduct(), 1)];
    expect(removeItem(lines, 1)).toEqual([]);
  });
});

describe("lineSubtotal", () => {
  it("multiplies the line's price by quantity", () => {
    const line = makeLine(makeProduct({ retail_price: 18000 }), 2);
    expect(lineSubtotal(line)).toBe(36000);
  });

  it("uses the overridden price, not the catalog price", () => {
    const line = makeLine(makeProduct({ retail_price: 18000 }), 2, 15000);
    expect(lineSubtotal(line)).toBe(30000);
  });
});

describe("totals", () => {
  it("sums item counts, subtotals, and catalog-price subtotals across lines", () => {
    const lines: CartLine[] = [
      makeLine(makeProduct({ retail_price: 385000 }), 1),
      makeLine(makeProduct({ product_id: 2, retail_price: 18000 }), 2),
    ];
    expect(totals(lines)).toEqual({ itemCount: 3, subtotal: 421000, listSubtotal: 421000 });
  });

  it("reports the catalog-price subtotal separately when a line is discounted or marked up", () => {
    const lines: CartLine[] = [
      makeLine(makeProduct({ retail_price: 385000 }), 1, 360000),
      makeLine(makeProduct({ product_id: 2, retail_price: 18000 }), 2, 20000),
    ];
    expect(totals(lines)).toEqual({ itemCount: 3, subtotal: 400000, listSubtotal: 421000 });
  });

  it("returns zeros for an empty cart", () => {
    expect(totals([])).toEqual({ itemCount: 0, subtotal: 0, listSubtotal: 0 });
  });
});

describe("setPriceNote", () => {
  it("sets the note on the matching line only", () => {
    const other = makeProduct({ product_id: 2, barcode: "PES-TV-00082", name: "TV" });
    const result = setPriceNote([makeLine(makeProduct(), 1), makeLine(other, 1)], 1, "Display unit");
    expect(result[0].priceNote).toBe("Display unit");
    expect(result[1].priceNote ?? "").toBe("");
  });
});

describe("saleItemsPayload", () => {
  it("sends unit_price only for changed lines and price_note only when written", () => {
    const changed = { ...makeLine(makeProduct(), 2, 120000), priceNote: " old stock " };
    const other = makeLine(makeProduct({ product_id: 2, barcode: "X", name: "TV", retail_price: 1000 }), 1);
    expect(saleItemsPayload([changed, other])).toEqual([
      { product: 1, quantity: 2, unit_price: "120000.00", price_note: "old stock" },
      { product: 2, quantity: 1 },
    ]);
  });
});
