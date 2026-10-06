import { describe, expect, it } from "vitest";
import { countActiveFilters, filterPurchases, type PurchaseFilters } from "./filterPurchases";
import type { PurchaseListRow } from "./usePurchases";

const rows: PurchaseListRow[] = [
  {
    purchase_id: 1, supplier_name: "Kigali Electronics Ltd", invoice_number: "KE-8841",
    purchase_date: "2026-08-23", payment_status: "paid", status: "draft",
  },
  {
    purchase_id: 2, supplier_name: "Dubai Traders FZE", invoice_number: null,
    purchase_date: "2026-08-10", payment_status: "unpaid", status: "received",
  },
  {
    purchase_id: 3, supplier_name: "Kigali Electronics Ltd", invoice_number: "KE-9001",
    purchase_date: "2026-09-01", payment_status: "partial", status: "cancelled",
  },
];

const none: PurchaseFilters = { search: "", status: "", paymentStatus: "", supplier: "" };
const ids = (list: PurchaseListRow[]) => list.map((r) => r.purchase_id);

describe("filterPurchases", () => {
  it("returns everything with no filters", () => {
    expect(ids(filterPurchases(rows, none))).toEqual([1, 2, 3]);
  });

  it("searches supplier name, invoice number and purchase number, ignoring case", () => {
    expect(ids(filterPurchases(rows, { ...none, search: "dubai" }))).toEqual([2]);
    expect(ids(filterPurchases(rows, { ...none, search: "ke-9001" }))).toEqual([3]);
    expect(ids(filterPurchases(rows, { ...none, search: "P-2" }))).toEqual([2]);
    expect(ids(filterPurchases(rows, { ...none, search: "  " }))).toEqual([1, 2, 3]);
  });

  it("filters by status, payment status and supplier, combined", () => {
    expect(ids(filterPurchases(rows, { ...none, status: "received" }))).toEqual([2]);
    expect(ids(filterPurchases(rows, { ...none, paymentStatus: "partial" }))).toEqual([3]);
    expect(ids(filterPurchases(rows, { ...none, supplier: "Kigali Electronics Ltd" }))).toEqual([1, 3]);
    expect(ids(filterPurchases(rows, { ...none, supplier: "Kigali Electronics Ltd", status: "draft" }))).toEqual([1]);
  });
});

describe("countActiveFilters", () => {
  it("counts the dropdown filters but not the search box", () => {
    expect(countActiveFilters(none)).toBe(0);
    expect(countActiveFilters({ ...none, search: "x" })).toBe(0);
    expect(countActiveFilters({ ...none, status: "draft", supplier: "A" })).toBe(2);
  });
});
