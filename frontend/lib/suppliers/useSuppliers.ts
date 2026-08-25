import { useQuery } from "@tanstack/react-query";
import { fetchAllPages } from "@/lib/api-client";
import type { Supplier } from "@/lib/types";

export interface Suppliers {
  all: Supplier[];
  isLoading: boolean;
  isError: boolean;
}

export function useSuppliers(): Suppliers {
  const query = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => fetchAllPages<Supplier>("suppliers/"),
  });

  return {
    all: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
