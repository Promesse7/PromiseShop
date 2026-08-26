import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { ShopProfile } from "@/lib/types";

export interface UseShopProfileResult {
  data: ShopProfile | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function useShopProfile(): UseShopProfileResult {
  const query = useQuery({
    queryKey: ["shop-profile"],
    queryFn: () => apiFetch<ShopProfile>("shop-profile/"),
  });

  return { data: query.data, isLoading: query.isLoading, isError: query.isError };
}
