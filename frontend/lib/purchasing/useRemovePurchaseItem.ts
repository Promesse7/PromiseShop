import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface RemovePurchaseItemInput {
  purchaseId: number;
  itemId: number;
}

export function useRemovePurchaseItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ purchaseId, itemId }: RemovePurchaseItemInput) =>
      apiFetch<void>(`purchases/${purchaseId}/items/${itemId}/`, { method: "DELETE" }),
    onSuccess: (_data, { purchaseId }) => {
      queryClient.invalidateQueries({ queryKey: ["purchases", purchaseId] });
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
    },
  });
}
