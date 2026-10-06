import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { PurchaseItem } from "@/lib/types";

export interface UpdatePurchaseItemInput {
  purchaseId: number;
  itemId: number;
  changes: Partial<{
    quantity: number;
    unit_cost_paid: string;
    unit_cost_invoiced: string;
    price_discrepancy_note: string;
  }>;
}

/** PATCH /purchases/<id>/items/<item_id>/ — draft purchases only. */
export function useUpdatePurchaseItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ purchaseId, itemId, changes }: UpdatePurchaseItemInput) =>
      apiFetch<PurchaseItem>(`purchases/${purchaseId}/items/${itemId}/`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      }),
    onSuccess: (_data, { purchaseId }) => {
      queryClient.invalidateQueries({ queryKey: ["purchases", purchaseId] });
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
    },
  });
}
