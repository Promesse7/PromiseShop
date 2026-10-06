import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { DuplicatePair, MergeCounts, MergePreview } from "@/lib/types";

/** GET /products/duplicates/ — similar-looking active products (admin). */
export function useDuplicatePairs(enabled: boolean) {
  const query = useQuery({
    queryKey: ["products", "duplicates"],
    queryFn: () => apiFetch<{ results: DuplicatePair[] }>("products/duplicates/").then((d) => d.results),
    enabled,
  });
  return { pairs: query.data ?? [], isLoading: query.isLoading, isError: query.isError };
}

/** GET /products/<keep>/merge/?duplicate= — what the merge would move. */
export function useMergePreview(keepId: number | null, duplicateId: number | null) {
  return useQuery({
    queryKey: ["products", keepId, "merge-preview", duplicateId],
    queryFn: () => apiFetch<MergePreview>(`products/${keepId}/merge/?duplicate=${duplicateId}`),
    enabled: keepId != null && duplicateId != null,
  });
}

export interface MergeInput {
  keepId: number;
  duplicateId: number;
  reason: string;
}

/** POST /products/<keep>/merge/ — irreversible. */
export function useMergeProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ keepId, duplicateId, reason }: MergeInput) =>
      apiFetch<{ merge_id: number; keep: number; duplicate: number; counts: MergeCounts }>(`products/${keepId}/merge/`, {
        method: "POST",
        body: JSON.stringify({ duplicate: duplicateId, reason }),
      }),
    onSuccess: () => {
      for (const key of [
        ["products"], ["product-pricing"], ["inventory"], ["stock-movements"], ["product-search"],
        ["product-barcode-aliases"], ["equipment-units"],
      ]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}
