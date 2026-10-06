import type { PurchaseListRow } from "./usePurchases";

export interface PurchaseFilters {
  search: string;
  /** "" = any. */
  status: "" | PurchaseListRow["status"];
  paymentStatus: "" | PurchaseListRow["payment_status"];
  /** Supplier name; "" = any. */
  supplier: string;
}

export const NO_PURCHASE_FILTERS: PurchaseFilters = { search: "", status: "", paymentStatus: "", supplier: "" };

/** Search matches supplier, invoice number and the "P-12" purchase number. */
export function filterPurchases(rows: PurchaseListRow[], filters: PurchaseFilters): PurchaseListRow[] {
  const q = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.status && row.status !== filters.status) return false;
    if (filters.paymentStatus && row.payment_status !== filters.paymentStatus) return false;
    if (filters.supplier && row.supplier_name !== filters.supplier) return false;
    if (!q) return true;
    return (
      row.supplier_name.toLowerCase().includes(q) ||
      (row.invoice_number ?? "").toLowerCase().includes(q) ||
      `p-${row.purchase_id}` === q ||
      String(row.purchase_id) === q
    );
  });
}

/** The dropdown filters that are set (the search box is always visible, so it isn't counted). */
export function countActiveFilters(filters: PurchaseFilters): number {
  return [filters.status, filters.paymentStatus, filters.supplier].filter(Boolean).length;
}
