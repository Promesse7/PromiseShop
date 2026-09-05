import { useMemo } from "react";
import { useCatalogProducts } from "@/lib/products/useCatalogProducts";
import { usePurchases } from "@/lib/purchasing/usePurchases";
import { deriveWorkflowHints, type WorkflowHint } from "./workflowHints";

export interface WorkflowHints {
  hints: WorkflowHint[];
  isLoading: boolean;
}

// Reuses the catalog and purchases queries (same keys as the pages), so mounting
// this on every page costs no extra requests once either page has loaded.
export function useWorkflowHints(): WorkflowHints {
  const catalog = useCatalogProducts();
  const purchases = usePurchases();
  const isLoading = catalog.isLoading || purchases.isLoading;

  const hints = useMemo(() => {
    if (isLoading || catalog.isError || purchases.isError) return [];
    return deriveWorkflowHints({
      products: catalog.all,
      categoryCount: catalog.categories.length,
      purchases: purchases.rows,
      now: new Date(),
    });
  }, [isLoading, catalog.isError, purchases.isError, catalog.all, catalog.categories.length, purchases.rows]);

  return { hints, isLoading };
}
