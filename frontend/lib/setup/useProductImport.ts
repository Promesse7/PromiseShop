import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { ImportResult } from "@/lib/types";

export interface ImportTemplate {
  filename: string;
  columns: string[];
  csv: string;
}

/** The CSV template, as JSON (the API proxy only relays JSON). */
export function fetchImportTemplate(): Promise<ImportTemplate> {
  return apiFetch<ImportTemplate>("setup/import-products/template/?as=json");
}

/** Save text as a file in the browser. */
export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export interface ImportInput {
  csv: string;
  commit: boolean;
}

/** POST /setup/import-products/ — a dry run (commit false) writes nothing. */
export function useProductImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ csv, commit }: ImportInput) =>
      apiFetch<ImportResult>("setup/import-products/", { method: "POST", body: JSON.stringify({ csv, commit }) }),
    onSuccess: (result) => {
      if (result.dry_run) return;
      for (const key of [["products"], ["categories"], ["product-pricing"], ["inventory"], ["stock-movements"], ["product-search"]]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}
