import { useQuery } from "@tanstack/react-query";
import { fetchAllPages } from "@/lib/api-client";
import type { Employee } from "@/lib/types";

export interface Employees {
  all: Employee[];
  isLoading: boolean;
  isError: boolean;
}

export function useEmployees(enabled: boolean): Employees {
  const query = useQuery({
    queryKey: ["employees"],
    queryFn: () => fetchAllPages<Employee>("employees/"),
    enabled,
  });

  return {
    all: query.data ?? [],
    isLoading: enabled && query.isLoading,
    isError: query.isError,
  };
}
