import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { InventoryAdjustment } from "@/lib/types";

export interface InventoryAdjustments {
  adjustments: InventoryAdjustment[];
  isLoading: boolean;
  isError: boolean;
}

// Newest first, as the API returns them.
export function useInventoryAdjustments(inventoryId: number | undefined, enabled = true): InventoryAdjustments {
  const isEnabled = enabled && inventoryId != null;
  const query = useQuery({
    queryKey: ["inventory-adjustments", inventoryId],
    queryFn: () => apiFetch<InventoryAdjustment[]>(`inventory/${inventoryId}/adjustments/`),
    enabled: isEnabled,
    retry: false,
  });

  return {
    adjustments: query.data ?? [],
    isLoading: isEnabled && query.isLoading,
    isError: query.isError,
  };
}
