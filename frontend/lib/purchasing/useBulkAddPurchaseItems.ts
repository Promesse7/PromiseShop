import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api-client";
import type { BulkSavedPurchaseItem } from "@/lib/types";
import type { BulkRowPayload } from "./bulkRows";
import { invalidatePurchaseItemQueries } from "./useAddPurchaseItem";

export interface BulkAddInput {
  purchaseId: number;
  rows: BulkRowPayload[];
}

/** Per-row errors from a refused bulk save, keyed by the row's index in the request. */
export type BulkRowErrors = Record<string, unknown>;

/** Pull `row_errors` out of a 400 from POST /purchases/<id>/items/bulk/, if that's what it is. */
export function bulkRowErrors(error: unknown): BulkRowErrors | null {
  if (!(error instanceof ApiError) || error.status !== 400) return null;
  const body = error.body as { row_errors?: BulkRowErrors } | null;
  return body && typeof body === "object" && body.row_errors ? body.row_errors : null;
}

/** Flatten one row's DRF error structure into a readable sentence. */
export function describeRowError(errors: unknown): string {
  if (typeof errors === "string") return errors;
  if (Array.isArray(errors)) return errors.map(describeRowError).join(" ");
  if (errors && typeof errors === "object") {
    return Object.entries(errors as Record<string, unknown>)
      .map(([field, value]) => {
        const text = describeRowError(value);
        return field === "non_field_errors" ? text : `${field.replace(/_/g, " ")}: ${text}`;
      })
      .join(" ");
  }
  return "This row could not be saved.";
}

/** POST /purchases/<id>/items/bulk/ — all rows are saved, or none are. */
export function useBulkAddPurchaseItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ purchaseId, rows }: BulkAddInput) =>
      apiFetch<{ items: BulkSavedPurchaseItem[] }>(`purchases/${purchaseId}/items/bulk/`, {
        method: "POST",
        body: JSON.stringify({ items: rows }),
      }),
    onSuccess: (_data, { purchaseId }) => {
      invalidatePurchaseItemQueries(queryClient, purchaseId);
      queryClient.invalidateQueries({ queryKey: ["product-search"] });
    },
  });
}
