import { useQuery } from "@tanstack/react-query";
import { fetchAllPages } from "@/lib/api-client";
import type { Expense } from "@/lib/types";

export interface Expenses {
  all: Expense[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useExpenses(enabled: boolean): Expenses {
  const query = useQuery({
    queryKey: ["expenses"],
    queryFn: () => fetchAllPages<Expense>("expenses/"),
    enabled,
  });

  return {
    all: query.data ?? [],
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
