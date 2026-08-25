"use client";

import { Card } from "@/components/ui/Card";
import { lineSubtotal, type CartLine } from "@/lib/pos/cart";

interface CartCardsProps {
  lines: CartLine[];
  onSetQuantity: (productId: number, quantity: number) => void;
}

export function CartCards({ lines, onSetQuantity }: CartCardsProps) {
  return (
    <div className="flex lg:hidden flex-col gap-2">
      {lines.length === 0 ? (
        <p className="text-center text-text/50 py-6">No items scanned yet</p>
      ) : (
        lines.map((line) => (
          <Card key={line.product.product_id} elevation="sm">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="text-sm">{line.product.name}</div>
                <div className="text-xs text-text/50">
                  RWF {line.product.retail_price.toLocaleString()}
                </div>
              </div>
              <div className="flex items-center border border-divider rounded-md overflow-hidden">
                <button
                  type="button"
                  aria-label="−"
                  className="w-11 h-11 flex items-center justify-center"
                  onClick={() => onSetQuantity(line.product.product_id, line.quantity - 1)}
                >
                  −
                </button>
                <span className="w-10 text-center text-[15px]">{line.quantity}</span>
                <button
                  type="button"
                  aria-label="+"
                  className="w-11 h-11 flex items-center justify-center"
                  onClick={() => onSetQuantity(line.product.product_id, line.quantity + 1)}
                >
                  +
                </button>
              </div>
              <div className="w-[100px] text-right font-sans font-medium">
                {lineSubtotal(line).toLocaleString()}
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
