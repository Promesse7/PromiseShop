import type { PosProduct } from "@/lib/types";

export interface CartLine {
  product: PosProduct;
  quantity: number;
  // Price this line will actually be sold at. Seeded from the catalog's current
  // retail price and editable at the till — the catalog price on `product` is
  // never changed by a point-of-sale override.
  unitPrice: number;
}

export function addItem(lines: CartLine[], product: PosProduct): CartLine[] {
  const existing = lines.find((line) => line.product.product_id === product.product_id);
  if (existing) {
    return lines.map((line) =>
      line.product.product_id === product.product_id
        ? { ...line, quantity: line.quantity + 1 }
        : line
    );
  }
  return [...lines, { product, quantity: 1, unitPrice: product.retail_price }];
}

export function setQuantity(lines: CartLine[], productId: number, quantity: number): CartLine[] {
  if (quantity <= 0) {
    return removeItem(lines, productId);
  }
  return lines.map((line) =>
    line.product.product_id === productId ? { ...line, quantity } : line
  );
}

export function setUnitPrice(lines: CartLine[], productId: number, unitPrice: number): CartLine[] {
  return lines.map((line) =>
    line.product.product_id === productId ? { ...line, unitPrice } : line
  );
}

export function removeItem(lines: CartLine[], productId: number): CartLine[] {
  return lines.filter((line) => line.product.product_id !== productId);
}

export function lineSubtotal(line: CartLine): number {
  return line.unitPrice * line.quantity;
}

export interface CartTotals {
  itemCount: number;
  subtotal: number;
  // What the same lines would come to at catalog prices, so the till can show
  // the net discount or markup the cashier has applied.
  listSubtotal: number;
}

export function totals(lines: CartLine[]): CartTotals {
  return lines.reduce(
    (acc, line) => ({
      itemCount: acc.itemCount + line.quantity,
      subtotal: acc.subtotal + lineSubtotal(line),
      listSubtotal: acc.listSubtotal + line.product.retail_price * line.quantity,
    }),
    { itemCount: 0, subtotal: 0, listSubtotal: 0 }
  );
}
