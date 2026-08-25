import { useQuery } from "@tanstack/react-query";
import { fetchAllPages } from "@/lib/api-client";
import type { EquipmentUnit } from "@/lib/types";

export interface EquipmentUnitsResult {
  units: EquipmentUnit[];
  isLoading: boolean;
  isError: boolean;
}

export function useEquipmentUnits(productId: number | null): EquipmentUnitsResult {
  const query = useQuery({
    queryKey: ["equipment-units", "list", productId],
    queryFn: () => fetchAllPages<EquipmentUnit>(`equipment-units/?product=${productId}`),
    enabled: productId !== null,
  });

  return {
    units: query.data ?? [],
    isLoading: productId !== null && query.isLoading,
    isError: query.isError,
  };
}
