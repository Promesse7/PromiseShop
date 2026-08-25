import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { PurchaseItem } from "@/lib/types";
import type { AddItemPayload } from "./purchaseItemForm";

export interface AddPurchaseItemInput {
  purchaseId: number;
  payload: AddItemPayload;
}

export function useAddPurchaseItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ purchaseId, payload }: AddPurchaseItemInput) =>
      apiFetch<PurchaseItem>(`purchases/${purchaseId}/items/`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_data, { purchaseId }) => {
      queryClient.invalidateQueries({ queryKey: ["purchases", purchaseId] });
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      // New-product items create a Product + current ProductPricing row server-side.
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-pricing"] });
    },
  });
}
