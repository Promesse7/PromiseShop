import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { Purchase } from "@/lib/types";

export function useCancelPurchase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (purchaseId: number) =>
      apiFetch<Purchase>(`purchases/${purchaseId}/cancel/`, { method: "POST" }),
    onSuccess: (_data, purchaseId) => {
      queryClient.invalidateQueries({ queryKey: ["purchases", purchaseId] });
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      // Cancelling a received purchase reverses Inventory.quantity_in_stock server-side.
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}
