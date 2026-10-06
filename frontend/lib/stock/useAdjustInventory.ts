import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { InventoryAdjustment, InventoryAdjustmentType } from "@/lib/types";

export interface AdjustInventoryInput {
  inventoryId: number;
  adjustment_type: InventoryAdjustmentType;
  quantity: number;
  reason: string;
}

export function useAdjustInventory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ inventoryId, adjustment_type, quantity, reason }: AdjustInventoryInput) =>
      apiFetch<InventoryAdjustment>(`inventory/${inventoryId}/adjust/`, {
        method: "POST",
        body: JSON.stringify({ adjustment_type, quantity, reason }),
      }),
    onSuccess: () => {
      // Prefix-matches every inventory query (stock page, catalog, one product's row)
      // and every ledger view the adjustment just wrote to.
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
    },
  });
}
