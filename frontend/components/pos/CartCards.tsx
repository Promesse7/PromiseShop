"use client";

import { Card } from "@/components/ui/Card";
import { lineSubtotal, type CartLine } from "@/lib/pos/cart";
import type { PriceCheckLine } from "@/lib/types";
import { PriceDifference } from "./PriceDifference";
import { formatRwf } from "@/lib/format";

interface CartCardsProps {
  lines: CartLine[];
  onSetQuantity: (productId: number, quantity: number) => void;
  onSetUnitPrice: (productId: number, unitPrice: number) => void;
  verdicts?: Map<number, PriceCheckLine>;
  onSetPriceNote?: (productId: number, note: string) => void;
}

export function CartCards({ lines, onSetQuantity, onSetUnitPrice, verdicts, onSetPriceNote }: CartCardsProps) {
  return (
    <div className="flex lg:hidden flex-col gap-2">
      {lines.length === 0 ? (
        <p className="text-center text-text/50 py-6">No items scanned yet</p>
      ) : (
        lines.map((line) => {
          const verdict = verdicts?.get(line.product.product_id);
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
                  </div>
                  <PriceDifference line={line} verdict={verdict} />
                  {verdict?.needs_note && onSetPriceNote && (
                    <input
                      aria-label="Price note"
                      placeholder="Why this price?"
                      value={line.priceNote ?? ""}
                      onChange={(e) => onSetPriceNote(line.product.product_id, e.target.value)}
                      className="w-full mt-1 min-h-9 py-1 px-2 text-xs border border-red-400 rounded-md bg-surface"
                    />
                  )}
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
                  {formatRwf(lineSubtotal(line))}
                </div>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
