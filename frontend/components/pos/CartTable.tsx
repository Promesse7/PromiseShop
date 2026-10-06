"use client";

import { Button } from "@/components/ui/Button";
import { lineSubtotal, type CartLine } from "@/lib/pos/cart";
import type { PriceCheckLine } from "@/lib/types";
import { PriceDifference } from "./PriceDifference";

interface CartTableProps {
  lines: CartLine[];
  onSetQuantity: (productId: number, quantity: number) => void;
  onSetUnitPrice: (productId: number, unitPrice: number) => void;
  onRemove: (productId: number) => void;
  // Server verdicts per product id (usePriceCheck) and the note setter for below-floor lines.
  verdicts?: Map<number, PriceCheckLine>;
  onSetPriceNote?: (productId: number, note: string) => void;
}

function parseNumberInput(raw: string): number | null {
  if (raw === "") return null;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

export function CartTable({ lines, onSetQuantity, onSetUnitPrice, onRemove, verdicts, onSetPriceNote }: CartTableProps) {
  return (
    <div className="hidden lg:block overflow-x-auto">
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b border-divider">
          <th className="text-left font-medium py-2 px-2 text-text/70">Product</th>
          <th className="text-left font-medium py-2 px-2 text-text/70">Barcode</th>
          <th className="text-right font-medium py-2 px-2 text-text/70">Price (VAT incl.)</th>
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
          lines.map((line) => {
            const verdict = verdicts?.get(line.product.product_id);
            return (
              <tr key={line.product.product_id} className="border-b border-divider align-top">
                <td className="py-2 px-2">
                  {line.product.name}
                  <br />
                  <span className="text-xs text-text/50">
                    {line.product.category_name} · {line.product.model_number} ·{" "}
                    {line.product.quantity_in_stock} in stock
                  </span>
                </td>
                <td className="py-2 px-2 font-mono text-xs">{line.product.barcode}</td>
                <td className="py-2 px-2 text-right">
                  <input
                    type="number"
                    aria-label="Unit price"
                    min={0}
                    value={line.unitPrice}
                    onChange={(e) => {
                      const parsed = parseNumberInput(e.target.value);
                      if (parsed !== null) onSetUnitPrice(line.product.product_id, parsed);
                    }}
                    className="w-28 text-right min-h-9 py-1.5 px-2 border border-divider rounded-md bg-surface"
                  />
                  <PriceDifference line={line} verdict={verdict} />
                  {verdict?.needs_note && onSetPriceNote && (
                    <input
                      aria-label="Price note"
                      placeholder="Why this price?"
                      value={line.priceNote ?? ""}
                      onChange={(e) => onSetPriceNote(line.product.product_id, e.target.value)}
                      className="w-44 mt-1 min-h-8 py-1 px-2 text-xs border border-red-400 rounded-md bg-surface"
                    />
                  )}
                </td>
                <td className="py-2 px-2 text-right">
                  <input
                    type="number"
                    aria-label="Quantity"
                    min={0}
                    value={line.quantity}
                    onChange={(e) => {
                      const parsed = parseNumberInput(e.target.value);
                      if (parsed !== null) onSetQuantity(line.product.product_id, parsed);
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
            );
          })
        )}
      </tbody>
    </table>
    </div>
  );
}
