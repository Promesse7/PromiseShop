import { describe, expect, it } from "vitest";
import { addItem, setQuantity, removeItem, lineSubtotal, totals, type CartLine } from "./cart";
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

describe("addItem", () => {
  it("adds a new product as a line with quantity 1", () => {
    const result = addItem([], makeProduct());
    expect(result).toEqual([{ product: makeProduct(), quantity: 1 }]);
  });

  it("increments quantity when the product is already in the cart", () => {
    const existing: CartLine[] = [{ product: makeProduct(), quantity: 1 }];
    const result = addItem(existing, makeProduct());
    expect(result).toEqual([{ product: makeProduct(), quantity: 2 }]);
  });

  it("does not mutate the input array", () => {
    const existing: CartLine[] = [];
    addItem(existing, makeProduct());
    expect(existing).toEqual([]);
  });
});

describe("setQuantity", () => {
  it("updates the quantity of the matching line", () => {
    const lines: CartLine[] = [{ product: makeProduct(), quantity: 1 }];
    const result = setQuantity(lines, 1, 5);
    expect(result[0].quantity).toBe(5);
  });

  it("removes the line when quantity is set to 0 or less", () => {
    const lines: CartLine[] = [{ product: makeProduct(), quantity: 1 }];
    expect(setQuantity(lines, 1, 0)).toEqual([]);
    expect(setQuantity(lines, 1, -1)).toEqual([]);
  });

  it("leaves other lines untouched", () => {
    const other = makeProduct({ product_id: 2, barcode: "PES-TV-00082", name: "TV" });
    const lines: CartLine[] = [
      { product: makeProduct(), quantity: 1 },
      { product: other, quantity: 3 },
    ];
    const result = setQuantity(lines, 1, 5);
    expect(result.find((l) => l.product.product_id === 2)?.quantity).toBe(3);
  });
});

describe("removeItem", () => {
  it("removes the matching line", () => {
    const lines: CartLine[] = [{ product: makeProduct(), quantity: 1 }];
    expect(removeItem(lines, 1)).toEqual([]);
  });
});

describe("lineSubtotal", () => {
  it("multiplies retail price by quantity", () => {
    const line: CartLine = { product: makeProduct({ retail_price: 18000 }), quantity: 2 };
    expect(lineSubtotal(line)).toBe(36000);
  });
});

describe("totals", () => {
  it("sums item counts and subtotals across lines", () => {
    const lines: CartLine[] = [
      { product: makeProduct({ retail_price: 385000 }), quantity: 1 },
      { product: makeProduct({ product_id: 2, retail_price: 18000 }), quantity: 2 },
    ];
    expect(totals(lines)).toEqual({ itemCount: 3, subtotal: 421000 });
  });

  it("returns zeros for an empty cart", () => {
    expect(totals([])).toEqual({ itemCount: 0, subtotal: 0 });
  });
});
