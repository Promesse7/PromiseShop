import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, fetchAllPages } from "@/lib/api-client";
import type {
  CustomerDebtRow, CustomerPaymentResult, CustomerStatement, DebtsReport, Payment, PaymentMethod, Sale,
  SupplierDebtRow,
} from "@/lib/types";

// Every money mutation touches balances shown across these screens.
const MONEY_KEYS = ["debts", "customers", "sales", "payments", "purchases", "customer-statement"];

function useInvalidateMoney() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of MONEY_KEYS) queryClient.invalidateQueries({ queryKey: [key] });
  };
}

export function useCustomerDebts(enabled = true) {
  return useQuery({
    queryKey: ["debts", "customers"],
    queryFn: () => apiFetch<DebtsReport<CustomerDebtRow>>("debts/customers/"),
    enabled,
  });
}

export function useSupplierDebts(enabled = true) {
  return useQuery({
    queryKey: ["debts", "suppliers"],
    queryFn: () => apiFetch<DebtsReport<SupplierDebtRow>>("debts/suppliers/"),
    enabled,
  });
}

export function useCustomerOpenSales(customerId: number) {
  return useQuery({
    queryKey: ["sales", "open", customerId],
    queryFn: () => fetchAllPages<Sale>(`sales/?customer=${customerId}&open=true`),
  });
}

export function usePayments(filter: { customer?: number; purchase?: number }) {
  const params = new URLSearchParams();
  if (filter.customer) params.set("customer", String(filter.customer));
  if (filter.purchase) params.set("purchase", String(filter.purchase));
  return useQuery({
    queryKey: ["payments", filter],
    queryFn: () => fetchAllPages<Payment>(`payments/?${params.toString()}`),
  });
}

export function useCustomerStatement(customerId: number, from: string, to: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return useQuery({
    queryKey: ["customer-statement", customerId, from, to],
    queryFn: () => apiFetch<CustomerStatement>(`customers/${customerId}/statement/?${params.toString()}`),
  });
}

export interface PaymentInput {
  amount: string;
  method: PaymentMethod;
  reference: string;
  note?: string;
}

export function useRecordCustomerPayment() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (input: PaymentInput & { customer: number; sale_ids?: number[] }) =>
      apiFetch<CustomerPaymentResult>("payments/customer/", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: invalidate,
  });
}

export function useRecordSupplierPayment() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (input: PaymentInput & { purchase: number }) =>
      apiFetch<Payment>("payments/supplier/", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: invalidate,
  });
}

export function useReversePayment() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: number; reason: string }) =>
      apiFetch<Payment>(`payments/${paymentId}/reverse/`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: invalidate,
  });
}

export function useConfirmPurchaseReview() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (purchaseId: number) =>
      apiFetch(`debts/suppliers/purchases/${purchaseId}/confirm-review/`, { method: "POST", body: "{}" }),
    onSuccess: invalidate,
  });
}
