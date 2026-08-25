import { useQuery } from "@tanstack/react-query";
import { fetchAllPages } from "@/lib/api-client";
import type { Customer } from "@/lib/types";

export interface Customers {
  all: Customer[];
  isLoading: boolean;
  isError: boolean;
}

export function useCustomers(): Customers {
  const query = useQuery({
    queryKey: ["customers"],
    queryFn: () => fetchAllPages<Customer>("customers/"),
  });

  return {
    all: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
