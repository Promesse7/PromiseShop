import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { CartLine } from "@/lib/pos/cart";
import type { PriceCheckLine, PriceCheckResult } from "@/lib/types";

/**
 * Ask the server which bargaining rule each changed cart line falls under, so the
 * till can colour it (and ask for a PIN or a note) before "Complete sale". Only
 * lines whose price differs from the catalog are sent; with none, no request.
 * The server never returns cost or the floor itself.
 */
export function usePriceCheck(lines: CartLine[]): Map<number, PriceCheckLine> {
  const changed = lines.filter((line) => line.unitPrice > 0 && line.unitPrice !== line.product.retail_price);
  const items = changed.map((line) => ({ product: line.product.product_id, unit_price: line.unitPrice.toFixed(2) }));

  const query = useQuery({
    queryKey: ["price-check", items],
    queryFn: () =>
      apiFetch<PriceCheckResult>("sales/price-check/", { method: "POST", body: JSON.stringify({ items }) }),
    enabled: items.length > 0,
    staleTime: 60_000,
  });

  const verdicts = new Map<number, PriceCheckLine>();
  if (items.length > 0 && query.data) {
    query.data.lines.forEach((verdict, index) => {
      const line = changed[index];
      if (line) verdicts.set(line.product.product_id, verdict);
    });
  }
  return verdicts;
}
