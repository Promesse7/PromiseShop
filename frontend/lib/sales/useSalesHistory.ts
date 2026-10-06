import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { PaginatedResponse, ReturnCondition, RefundMethod, Sale, SaleStatus } from "@/lib/types";

export interface SalesFilters {
  from: string;
  to: string;
  cashier: string;
  customer: string;
  payment_status: string;
  payment_method: string;
  status: SaleStatus | "";
  has_discount: boolean;
  has_return: boolean;
}

export const EMPTY_SALES_FILTERS: SalesFilters = {
  from: "",
  to: "",
  cashier: "",
  customer: "",
  payment_status: "",
  payment_method: "",
  status: "",
  has_discount: false,
  has_return: false,
};

export const PAGE_SIZE = 50;

/** The query string for GET /sales/ (only the filters that are set, then the page). */
export function salesQuery(filters: SalesFilters, page = 1): string {
  const params = new URLSearchParams();
  for (const key of ["from", "to", "cashier", "customer", "payment_status", "payment_method", "status"] as const) {
    if (filters[key]) params.set(key, filters[key]);
  }
  if (filters.has_discount) params.set("has_discount", "true");
  if (filters.has_return) params.set("has_return", "true");
  params.set("page", String(page));
  params.set("page_size", String(PAGE_SIZE));
  return params.toString();
}

/** Sales filters named in a URL's query string (dashboard links); unknown keys and empty values are ignored. */
export function salesFiltersFromParams(
  params: Record<string, string | string[] | undefined>
): Partial<SalesFilters> {
  const result: Record<string, string | boolean> = {};
  for (const key of Object.keys(EMPTY_SALES_FILTERS) as (keyof SalesFilters)[]) {
    const value = params[key];
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw == null || raw === "") continue;
    result[key] = typeof EMPTY_SALES_FILTERS[key] === "boolean" ? raw === "true" : raw;
  }
  return result as Partial<SalesFilters>;
}

export function useSalesHistory(filters: SalesFilters, page: number) {
  return useQuery({
    queryKey: ["sales", "history", filters, page],
    queryFn: () => apiFetch<PaginatedResponse<Sale>>(`sales/?${salesQuery(filters, page)}`),
  });
}

export function useSale(saleId: number) {
  return useQuery({
    queryKey: ["sales", "detail", saleId],
    queryFn: () => apiFetch<Sale>(`sales/${saleId}/`),
  });
}

// A void or return moves stock and money: refresh every screen that shows either.
const AFFECTED_KEYS = [
  "sales", "debts", "customers", "payments", "customer-statement", "inventory", "stock-movements", "daily-close",
];

function useInvalidateAfterReversal() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of AFFECTED_KEYS) queryClient.invalidateQueries({ queryKey: [key] });
  };
}

export function useVoidSale(saleId: number) {
  const invalidate = useInvalidateAfterReversal();
  return useMutation({
    mutationFn: (reason: string) =>
      apiFetch<Sale>(`sales/${saleId}/void/`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: invalidate,
  });
}

export interface ReturnLineInput {
  sale_item: number;
  quantity: number;
  condition: ReturnCondition;
  refund_amount?: string;
}

export interface ReturnInput {
  reason: string;
  refund_method?: RefundMethod | null;
  refund_reference?: string;
  items: ReturnLineInput[];
}

export function useReturnSaleItems(saleId: number) {
  const invalidate = useInvalidateAfterReversal();
  return useMutation({
    mutationFn: (input: ReturnInput) =>
      apiFetch<Sale & { return_id: number }>(`sales/${saleId}/returns/`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

/** Units of each sale line that can still come back: sold minus everything returned so far. */
export function returnableQuantities(sale: Sale): Record<number, number> {
  const returned: Record<number, number> = {};
  for (const r of sale.returns ?? []) {
    for (const item of r.items) returned[item.sale_item] = (returned[item.sale_item] ?? 0) + item.quantity;
  }
  const result: Record<number, number> = {};
  for (const item of sale.items) result[item.sale_item_id] = item.quantity - (returned[item.sale_item_id] ?? 0);
  return result;
}

/**
 * How a refund will be settled: it first reduces what is still owed on the sale,
 * and only the excess is paid out (mirrors return_sale_items on the backend).
 */
export function refundSplit(sale: Sale, refundTotal: number): { paidOut: number; balanceReduced: number } {
  const netTotal = Number(sale.total_amount) - Number(sale.returned_amount ?? 0);
  const paid = Number(sale.amount_paid ?? sale.total_amount);
  const paidOut = Math.min(Math.max(paid - (netTotal - refundTotal), 0), refundTotal);
  return { paidOut: round2(paidOut), balanceReduced: round2(refundTotal - paidOut) };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
