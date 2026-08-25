"use client";

import { Button } from "@/components/ui/Button";
import { lineSubtotal, type CartLine } from "@/lib/pos/cart";

interface CartTableProps {
  lines: CartLine[];
  onSetQuantity: (productId: number, quantity: number) => void;
  onRemove: (productId: number) => void;
}

export function CartTable({ lines, onSetQuantity, onRemove }: CartTableProps) {
  return (
    <table className="hidden lg:table w-full text-sm border-collapse">
      <thead>
        <tr className="border-b border-divider">
          <th className="text-left font-medium py-2 px-2 text-text/70">Product</th>
          <th className="text-left font-medium py-2 px-2 text-text/70">Barcode</th>
          <th className="text-right font-medium py-2 px-2 text-text/70">Retail price</th>
          <th className="text-right font-medium py-2 px-2 text-text/70 w-[76px]">Qty</th>
          <th className="text-right font-medium py-2 px-2 text-text/70">Subtotal</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {lines.length === 0 ? (
          <tr>
            <td colSpan={6} className="py-6 text-center text-text/50">
              No items scanned yet
            </td>
          </tr>
        ) : (
          lines.map((line) => (
            <tr key={line.product.product_id} className="border-b border-divider">
              <td className="py-2 px-2">
                {line.product.name}
                <br />
                <span className="text-xs text-text/50">
                  {line.product.category_name} · {line.product.model_number} ·{" "}
                  {line.product.quantity_in_stock} in stock
                </span>
              </td>
              <td className="py-2 px-2 font-mono text-xs">{line.product.barcode}</td>
              <td className="py-2 px-2 text-right">{line.product.retail_price.toLocaleString()}</td>
              <td className="py-2 px-2 text-right">
                <input
                  key={line.product.product_id}
                  type="number"
                  min={1}
                  defaultValue={line.quantity}
                  onChange={(e) => {
                    const num = Number(e.target.value);
                    if (num > 0) {
                      onSetQuantity(line.product.product_id, num);
                    }
                  }}
                  className="w-14 text-right min-h-9 py-1.5 px-2 border border-divider rounded-md bg-surface"
                />
              </td>
              <td className="py-2 px-2 text-right">{lineSubtotal(line).toLocaleString()}</td>
              <td className="py-2 px-2">
                <Button variant="ghost" onClick={() => onRemove(line.product.product_id)}>
                  Remove
                </Button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
