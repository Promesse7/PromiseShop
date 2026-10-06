import type { PosProduct } from "@/lib/types";

export interface CartLine {
  product: PosProduct;
  quantity: number;
  // Price this line will actually be sold at. Seeded from the catalog's current
  // retail price and editable at the till — the catalog price on `product` is
  // never changed by a point-of-sale override.
  unitPrice: number;
  // Why the price is what it is — required when it is below the price floor.
  priceNote?: string;
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

export function setPriceNote(lines: CartLine[], productId: number, priceNote: string): CartLine[] {
  return lines.map((line) =>
    line.product.product_id === productId ? { ...line, priceNote } : line
  );
}

export interface SaleItemPayload {
  product: number;
  quantity: number;
  unit_price?: string;
  price_note?: string;
}

// unit_price is only sent for lines the cashier changed, so the catalog price
// stays server-authoritative for everything else.
export function saleItemsPayload(lines: CartLine[]): SaleItemPayload[] {
  return lines.map((line) => {
    const note = (line.priceNote ?? "").trim();
    return {
      product: line.product.product_id,
      quantity: line.quantity,
      ...(line.unitPrice !== line.product.retail_price ? { unit_price: line.unitPrice.toFixed(2) } : {}),
      ...(note ? { price_note: note } : {}),
    };
  });
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
