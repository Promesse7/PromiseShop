import { useQuery } from "@tanstack/react-query";
import { fetchAllPages } from "@/lib/api-client";
import { useProductSearch } from "@/lib/products/useProductSearch";
import type { Customer, EmployeeRole } from "@/lib/types";
import { buildCommandResults, type CommandResult } from "./commandResults";

/**
 * Jump-search results for the palette. Products come from the ranked search endpoint
 * (debounced); customers reuse the ["customers"] collection, loaded only once the palette
 * is open and the query is long enough to search.
 */
export function useCommandResults(
  query: string,
  role: EmployeeRole,
  open: boolean
): { results: CommandResult[]; isSearching: boolean } {
  const searchable = open && query.trim().length >= 2;
  const products = useProductSearch(query, { enabled: searchable });
  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: () => fetchAllPages<Customer>("customers/"),
    enabled: searchable,
  });
  return {
    results: buildCommandResults({
      query,
      role,
      products: searchable ? products.results : [],
      customers: customers.data ?? [],
    }),
    isSearching: searchable && products.isFetching,
  };
}
