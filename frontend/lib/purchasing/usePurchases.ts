import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAllPages } from "@/lib/api-client";
import { useSuppliers } from "@/lib/suppliers/useSuppliers";
import type { Purchase } from "@/lib/types";

export interface PurchaseListRow {
  purchase_id: number;
  supplier_name: string;
  invoice_number: string | null;
  purchase_date: string;
  payment_status: Purchase["payment_status"];
  status: Purchase["status"];
  total_paid?: string;
  total_invoiced?: string;
}

export interface Purchases {
  rows: PurchaseListRow[];
  isLoading: boolean;
  isError: boolean;
}

export function usePurchases(): Purchases {
  const purchases = useQuery({
    queryKey: ["purchases"],
    queryFn: () => fetchAllPages<Purchase>("purchases/"),
  });
  const suppliers = useSuppliers();

  const isLoading = purchases.isLoading || suppliers.isLoading;
  const isError = purchases.isError || suppliers.isError;

  const rows = useMemo((): PurchaseListRow[] => {
    if (!purchases.data) return [];
    const supplierNameById = new Map(suppliers.all.map((s) => [s.supplier_id, s.name]));
    return purchases.data.map((p): PurchaseListRow => ({
      purchase_id: p.purchase_id,
      supplier_name: supplierNameById.get(p.supplier) ?? `Supplier #${p.supplier}`,
      invoice_number: p.invoice_number,
      purchase_date: p.purchase_date,
      payment_status: p.payment_status,
      status: p.status,
      total_paid: p.total_paid,
      total_invoiced: p.total_invoiced,
    }));
  }, [purchases.data, suppliers.all]);

  return { rows, isLoading, isError };
}
