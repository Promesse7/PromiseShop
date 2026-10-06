import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, fetchAllPages } from "@/lib/api-client";
import { invalidatePurchaseItemQueries } from "./useAddPurchaseItem";
import type { BundleSplitRow, BundleTemplate, PurchaseItem, PurchaseLineKind } from "@/lib/types";

export interface NewProductInput {
  category: number;
  name: string;
  selling_price: string;
}

export interface BundleComponentInput {
  product?: number;
  new_product?: NewProductInput;
  qty_per_bundle: number;
  allocated_paid_cost?: string;
  allocated_invoiced_cost?: string;
}

/** POST /purchases/<id>/items/ body for a pack or bundle line (Module F). */
export interface LinePayload {
  line_kind: PurchaseLineKind;
  quantity: number;
  unit_cost_paid: string;
  unit_cost_invoiced: string;
  price_discrepancy_note?: string;
  // pack
  product?: number;
  units_per_pack?: number;
  category?: number;
  name?: string;
  selling_price?: string;
  // bundle
  bundle_name?: string;
  components?: BundleComponentInput[];
  save_as_template?: boolean;
  template_name?: string;
}

export function useAddPurchaseLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ purchaseId, payload }: { purchaseId: number; payload: LinePayload }) =>
      apiFetch<PurchaseItem>(`purchases/${purchaseId}/items/`, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: (_data, { purchaseId, payload }) => {
      invalidatePurchaseItemQueries(queryClient, purchaseId);
      if (payload.save_as_template) queryClient.invalidateQueries({ queryKey: ["bundle-templates"] });
    },
  });
}

export function useBundleTemplates(supplierId?: number) {
  return useQuery({
    queryKey: ["bundle-templates", supplierId ?? "all"],
    queryFn: () =>
      fetchAllPages<BundleTemplate>(supplierId ? `bundle-templates/?supplier=${supplierId}` : "bundle-templates/"),
  });
}

export interface SplitPreviewInput {
  unit_cost_paid: string;
  unit_cost_invoiced: string;
  components: BundleComponentInput[];
}

export function useBundleSplitPreview() {
  return useMutation({
    mutationFn: (input: SplitPreviewInput) =>
      apiFetch<{ components: BundleSplitRow[] }>("purchasing/bundle-split-preview/", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}
