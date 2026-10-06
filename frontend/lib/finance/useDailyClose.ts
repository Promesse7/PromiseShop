import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { DailyClose, DayFigures, PaginatedResponse } from "@/lib/types";

export function useDayPreview(params: { cashier?: number; date: string; openingFloat: string }) {
  const search = new URLSearchParams();
  if (params.cashier) search.set("cashier", String(params.cashier));
  if (params.date) search.set("date", params.date);
  if (params.openingFloat) search.set("opening_float", params.openingFloat);
  return useQuery({
    queryKey: ["daily-close", "preview", params],
    queryFn: () => apiFetch<DayFigures>(`daily-close/preview/?${search.toString()}`),
  });
}

export function useDailyCloses(filter: { cashier?: number } = {}) {
  const search = new URLSearchParams({ page_size: "100" });
  if (filter.cashier) search.set("cashier", String(filter.cashier));
  return useQuery({
    queryKey: ["daily-close", "list", filter],
    queryFn: () => apiFetch<PaginatedResponse<DailyClose>>(`daily-close/?${search.toString()}`),
  });
}

export interface CloseDayInput {
  // Omitted: the signed-in employee closes their own day.
  cashier?: number;
  business_date: string;
  opening_float: string;
  counted_cash: string;
  note: string;
  approval: { approver_username: string; pin: string };
}

export function useCloseDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CloseDayInput) =>
      apiFetch<DailyClose>("daily-close/", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["daily-close"] }),
  });
}
