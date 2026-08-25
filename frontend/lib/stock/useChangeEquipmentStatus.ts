import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { EquipmentUnit, EquipmentUnitStatus } from "@/lib/types";

export interface ChangeEquipmentStatusInput {
  unitId: number;
  new_status: EquipmentUnitStatus;
  reason: string;
}

export function useChangeEquipmentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ unitId, new_status, reason }: ChangeEquipmentStatusInput) =>
      apiFetch<EquipmentUnit>(`equipment-units/${unitId}/change-status/`, {
        method: "POST",
        body: JSON.stringify({ new_status, reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment-units"] });
    },
  });
}
