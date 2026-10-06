import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { movementsQuery, type MovementFilters } from "@/lib/stock/movements";
import type { PaginatedResponse, StockMovement } from "@/lib/types";

export interface StockMovements {
  movements: StockMovement[];
  /** Total matching rows on the server (may exceed what was loaded). */
  count: number;
  isLoading: boolean;
  isError: boolean;
}

// Newest first, as the API returns them. Loads one page of `pageSize` rows.
export function useStockMovements(filters: MovementFilters, pageSize = 200, enabled = true): StockMovements {
  const query = useQuery({
    queryKey: ["stock-movements", filters, pageSize],
    queryFn: () =>
      apiFetch<PaginatedResponse<StockMovement>>(`stock/movements/?${movementsQuery(filters, pageSize)}`),
    enabled,
    retry: false,
  });

  return {
    movements: query.data?.results ?? [],
    count: query.data?.count ?? 0,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
  };
}
