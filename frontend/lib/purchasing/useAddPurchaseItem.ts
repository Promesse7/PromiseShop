import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { PurchaseItem } from "@/lib/types";
import type { AddItemPayload } from "./purchaseItemForm";

export interface AddPurchaseItemInput {
  purchaseId: number;
  payload: AddItemPayload;
  // Bulk entry adds many rows back-to-back and refreshes once at the end —
  // refreshing after every row re-triggers the multi-page products fetch mid-batch.
  invalidate?: boolean;
}

export function invalidatePurchaseItemQueries(queryClient: QueryClient, purchaseId: number) {
  queryClient.invalidateQueries({ queryKey: ["purchases", purchaseId] });
  queryClient.invalidateQueries({ queryKey: ["purchases"] });
  // New-product items create a Product + current ProductPricing row server-side.
  queryClient.invalidateQueries({ queryKey: ["products"] });
  queryClient.invalidateQueries({ queryKey: ["product-pricing"] });
}

export function useAddPurchaseItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ purchaseId, payload }: AddPurchaseItemInput) =>
      apiFetch<PurchaseItem>(`purchases/${purchaseId}/items/`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_data, { purchaseId, invalidate }) => {
      if (invalidate === false) return;
      invalidatePurchaseItemQueries(queryClient, purchaseId);
    },
  });
}
