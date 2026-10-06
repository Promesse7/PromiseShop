import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { SupplierRecentProduct } from "@/lib/types";

/** GET /suppliers/<id>/recent-products/ — the last 20 distinct products bought from them. */
export function useRecentSupplierProducts(supplierId: number | undefined) {
  const query = useQuery({
    queryKey: ["suppliers", supplierId, "recent-products"],
    queryFn: () =>
      apiFetch<{ results: SupplierRecentProduct[] }>(`suppliers/${supplierId}/recent-products/`).then((d) => d.results),
    enabled: supplierId != null,
  });
  return { products: query.data ?? [], isLoading: query.isLoading };
}
