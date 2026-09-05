import { useQuery } from "@tanstack/react-query";
import { apiFetch, fetchAllPages } from "@/lib/api-client";
import type { Product, Category, ProductPricing, Inventory, PaginatedResponse } from "@/lib/types";

export interface ProductDetail {
  product: Product | undefined;
  category: Category | undefined;
  currentPricing: ProductPricing | undefined;
  priceHistory: ProductPricing[];
  inventory: Inventory | undefined;
  hasTrackedSerials: boolean;
  trackedSerialCount: number;
  isLoading: boolean;
  isError: boolean;
}

export function useProductDetail(productId: number): ProductDetail {
  const product = useQuery({
    queryKey: ["products", productId],
    queryFn: () => apiFetch<Product>(`products/${productId}/`),
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => fetchAllPages<Category>("categories/"),
  });
  const priceHistory = useQuery({
    queryKey: ["product-pricing", "history", productId],
    queryFn: () => fetchAllPages<ProductPricing>(`product-pricing/?product=${productId}`),
  });
  // One row, not the whole collection: the key still starts with "inventory" so the
  // existing invalidations after sales/purchases/receives reach it.
  const inventory = useQuery({
    queryKey: ["inventory", "product", productId],
    queryFn: () => apiFetch<PaginatedResponse<Inventory>>(`inventory/?product=${productId}`),
  });
  const equipmentCount = useQuery({
    queryKey: ["equipment-units", "count", productId],
    queryFn: () => apiFetch<PaginatedResponse<{ unit_id: number }>>(`equipment-units/?product=${productId}`),
  });

  const isLoading =
    product.isLoading || categories.isLoading || priceHistory.isLoading || inventory.isLoading || equipmentCount.isLoading;
  const isError =
    product.isError || categories.isError || priceHistory.isError || inventory.isError || equipmentCount.isError;

  const category = categories.data?.find((c) => c.category_id === product.data?.category);
  const currentPricing = priceHistory.data?.find((p) => p.is_current);
  const productInventory = inventory.data?.results.find((i) => i.product === productId);
  const trackedSerialCount = equipmentCount.data?.count ?? 0;
  const hasTrackedSerials = trackedSerialCount > 0;

  return {
    product: product.data,
    category,
    currentPricing,
    priceHistory: priceHistory.data ?? [],
    inventory: productInventory,
    hasTrackedSerials,
    trackedSerialCount,
    isLoading,
    isError,
  };
}
