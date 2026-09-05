"use client";

import { Card } from "@/components/ui/Card";
import { lineSubtotal, type CartLine } from "@/lib/pos/cart";

interface CartCardsProps {
  lines: CartLine[];
  onSetQuantity: (productId: number, quantity: number) => void;
  onSetUnitPrice: (productId: number, unitPrice: number) => void;
}

export function CartCards({ lines, onSetQuantity, onSetUnitPrice }: CartCardsProps) {
  return (
    <div className="flex lg:hidden flex-col gap-2">
      {lines.length === 0 ? (
        <p className="text-center text-text/50 py-6">No items scanned yet</p>
      ) : (
        lines.map((line) => {
          const priceChanged = line.unitPrice !== line.product.retail_price;
          return (
            <Card key={line.product.product_id} elevation="sm">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm">{line.product.name}</div>
                  <div className="flex items-center gap-1.5 text-xs text-text/50 mt-0.5">
                    <span>RWF</span>
                    <input
                      type="number"
                      aria-label="Unit price"
                      min={0}
                      value={line.unitPrice}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") return;
                        const parsed = Number(raw);
                        if (Number.isNaN(parsed)) return;
                        onSetUnitPrice(line.product.product_id, parsed);
                      }}
                      className="w-24 text-right min-h-9 py-1.5 px-2 text-sm text-text border border-divider rounded-md bg-surface"
                    />
                    {priceChanged && <span>list {line.product.retail_price.toLocaleString()}</span>}
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
          );
        })
      )}
    </div>
  );
}
