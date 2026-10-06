import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { OpeningStockStatus } from "@/lib/types";

/** Whether "Set opening stock" applies (admin only; never-received products). */
export function useOpeningStockStatus(productId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["products", productId, "opening-stock"],
    queryFn: () => apiFetch<OpeningStockStatus>(`products/${productId}/opening-stock/`),
    enabled,
  });
}

export interface SetOpeningStockInput {
  quantity: number;
  unit_cost: string;
  reason?: string;
}

export function useSetOpeningStock(productId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetOpeningStockInput) =>
      apiFetch<OpeningStockStatus & { movement_id: number }>(`products/${productId}/opening-stock/`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      for (const key of [["products", productId, "opening-stock"], ["inventory"], ["stock-movements"], ["products", productId]]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}
