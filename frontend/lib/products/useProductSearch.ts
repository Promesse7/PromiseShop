import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { ProductSearchResult } from "@/lib/types";

export const SEARCH_DEBOUNCE_MS = 200;

/** GET /products/search/ — ranked by the backend (barcode, exact name, starts-with, similar). */
export async function fetchProductSearch(query: string, limit = 8): Promise<ProductSearchResult[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const data = await apiFetch<{ results: ProductSearchResult[] }>(`products/search/?${params.toString()}`);
  return data.results;
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export interface ProductSearchState {
  results: ProductSearchResult[];
  /** The (debounced) query these results answer. */
  query: string;
  isFetching: boolean;
  isError: boolean;
}

export function useProductSearch(query: string, { enabled = true }: { enabled?: boolean } = {}): ProductSearchState {
  const debounced = useDebounced(query.trim(), SEARCH_DEBOUNCE_MS);
  const search = useQuery({
    queryKey: ["product-search", debounced],
    queryFn: () => fetchProductSearch(debounced),
    enabled: enabled && debounced !== "",
    staleTime: 10_000,
  });
  return {
    results: debounced === "" ? [] : search.data ?? [],
    query: debounced,
    isFetching: search.isFetching,
    isError: search.isError,
  };
}
