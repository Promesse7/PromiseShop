import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { Purchase } from "@/lib/types";

export interface PurchaseDetail {
  purchase: Purchase | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function usePurchaseDetail(purchaseId: number): PurchaseDetail {
  const query = useQuery({
    queryKey: ["purchases", purchaseId],
    queryFn: () => apiFetch<Purchase>(`purchases/${purchaseId}/`),
  });

  return {
    purchase: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
