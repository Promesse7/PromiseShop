import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { Purchase } from "@/lib/types";

export function useReceivePurchase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (purchaseId: number) =>
      apiFetch<Purchase>(`purchases/${purchaseId}/receive/`, { method: "POST" }),
    onSuccess: (_data, purchaseId) => {
      queryClient.invalidateQueries({ queryKey: ["purchases", purchaseId] });
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      // Receiving increments Inventory.quantity_in_stock for every line item server-side.
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}
