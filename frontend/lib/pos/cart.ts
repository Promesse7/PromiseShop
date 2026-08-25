import type { PosProduct } from "@/lib/types";

export interface CartLine {
  product: PosProduct;
  quantity: number;
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
  return [...lines, { product, quantity: 1 }];
}

export function setQuantity(lines: CartLine[], productId: number, quantity: number): CartLine[] {
  if (quantity <= 0) {
    return removeItem(lines, productId);
  }
  return lines.map((line) =>
    line.product.product_id === productId ? { ...line, quantity } : line
  );
}

export function removeItem(lines: CartLine[], productId: number): CartLine[] {
  return lines.filter((line) => line.product.product_id !== productId);
}

export function lineSubtotal(line: CartLine): number {
  return line.product.retail_price * line.quantity;
}

export interface CartTotals {
  itemCount: number;
  subtotal: number;
}

export function totals(lines: CartLine[]): CartTotals {
  return lines.reduce(
    (acc, line) => ({
      itemCount: acc.itemCount + line.quantity,
      subtotal: acc.subtotal + lineSubtotal(line),
    }),
    { itemCount: 0, subtotal: 0 }
  );
}
