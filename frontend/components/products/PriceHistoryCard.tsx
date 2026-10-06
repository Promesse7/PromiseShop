"use client";

import { Card, CardKicker } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import type { ProductPricing } from "@/lib/types";
import { formatRwf } from "@/lib/format";

interface PriceHistoryCardProps {
  history: ProductPricing[];
  onSetNewPrice: () => void;
  showWholesale: boolean;
  /** Only admin and manager may set prices (the backend refuses staff). */
  canSetPrice?: boolean;
}

export function PriceHistoryCard({ history, onSetNewPrice, showWholesale, canSetPrice = true }: PriceHistoryCardProps) {
  return (
    <Card elevation="sm">
      <CardKicker>Price history</CardKicker>
      {history.length === 0 ? (
        <p className="text-sm text-text/50">No price history yet</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-divider">
              <th className="text-left font-medium py-2 px-2 text-text/70">Effective</th>
              {showWholesale && (
                <th className="text-right font-medium py-2 px-2 text-text/70">Wholesale</th>
              )}
              <th className="text-right font-medium py-2 px-2 text-text/70">Retail</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {history.map((row) => (
              <tr key={row.price_id} className="border-b border-divider">
                <td className="py-2 px-2">
                  {new Date(row.effective_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </td>
                {showWholesale && (
                  <td className="py-2 px-2 text-right">
                    {row.wholesale_price != null ? formatRwf(row.wholesale_price) : "—"}
                  </td>
                )}
                <td className="py-2 px-2 text-right">{formatRwf(row.retail_price)}</td>
                <td className="py-2 px-2">{row.is_current && <Tag variant="accent">current</Tag>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      {canSetPrice && (
        <Button variant="secondary" onClick={onSetNewPrice} className="mt-2">
          Set new price
        </Button>
      )}
    </Card>
  );
}
