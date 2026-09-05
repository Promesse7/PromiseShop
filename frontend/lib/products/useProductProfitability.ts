import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { ProfitabilityResponse, ProfitabilityRow } from "@/lib/types";

export interface ProductProfitability {
  row: ProfitabilityRow | undefined;
  isLoading: boolean;
  isError: boolean;
}

// All-time cost & margin for one product. `enabled` lets callers skip the request
// for roles the endpoint would reject (sales staff, technicians).
export function useProductProfitability(productId: number, enabled = true): ProductProfitability {
  const query = useQuery({
    queryKey: ["dashboard", "profitability", "product", productId],
    queryFn: () =>
      apiFetch<ProfitabilityResponse>(`dashboard/profitability/?period=all&product=${productId}`),
    enabled,
    retry: false,
  });

  return {
    row: query.data?.products[0],
    isLoading: enabled && query.isLoading,
    isError: query.isError,
  };
}
