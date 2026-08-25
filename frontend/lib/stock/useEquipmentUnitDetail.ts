import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { EquipmentUnitDetail } from "@/lib/types";

export interface EquipmentUnitDetailResult {
  unit: EquipmentUnitDetail | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function useEquipmentUnitDetail(unitId: number): EquipmentUnitDetailResult {
  const query = useQuery({
    queryKey: ["equipment-units", unitId],
    queryFn: () => apiFetch<EquipmentUnitDetail>(`equipment-units/${unitId}/`),
  });

  return { unit: query.data, isLoading: query.isLoading, isError: query.isError };
}
