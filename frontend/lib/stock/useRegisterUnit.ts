import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { EquipmentUnit } from "@/lib/types";

export interface RegisterUnitInput {
  product: number;
  serial_number: string;
  storage_location: string | null;
  condition_notes: string | null;
}

/**
 * EquipmentUnitSerializer marks `status` read-only on create (verified against the live
 * backend — see Decision 1 in the Phase 4 design doc), so registering a unit is two calls:
 * create it, then seed its status through the audited change-status action.
 */
export function useRegisterUnit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RegisterUnitInput) => {
      const created = await apiFetch<EquipmentUnit>("equipment-units/", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return apiFetch<EquipmentUnit>(`equipment-units/${created.unit_id}/change-status/`, {
        method: "POST",
        body: JSON.stringify({ new_status: "in_stock", reason: "Unit registered" }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment-units"] });
    },
  });
}
