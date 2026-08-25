import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import PurchasesPageClient from "./PurchasesPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";
import * as usePurchasesModule from "@/lib/purchasing/usePurchases";
import type { Purchases } from "@/lib/purchasing/usePurchases";

const rows: Purchases["rows"] = [
  {
    purchase_id: 1, supplier_name: "Kigali Electronics Ltd", invoice_number: "KE-8841",
    purchase_date: "2026-08-23", payment_status: "paid", status: "draft",
    total_paid: "3002000", total_invoiced: "3034000",
  },
];

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("PurchasesPageClient", () => {
  beforeEach(() => {
    vi.spyOn(usePurchasesModule, "usePurchases").mockReturnValue({
      rows, isLoading: false, isError: false,
    } satisfies Purchases);
  });

  it("shows the purchase list", () => {
    renderWithProviders(<PurchasesPageClient role="admin" />);
    expect(screen.getByText("Kigali Electronics Ltd")).toBeInTheDocument();
  });

  it("shows the + New purchase button for every role (purchasing is open to staff and admin alike)", () => {
    renderWithProviders(<PurchasesPageClient role="sales_staff" />);
    expect(screen.getByRole("button", { name: "+ New purchase" })).toBeInTheDocument();
  });

  it("shows totals only for admin/manager", () => {
    renderWithProviders(<PurchasesPageClient role="admin" />);
    expect(screen.getByRole("columnheader", { name: "Total paid" })).toBeInTheDocument();
  });

  it("hides totals for sales_staff", () => {
    renderWithProviders(<PurchasesPageClient role="sales_staff" />);
    expect(screen.queryByRole("columnheader", { name: "Total paid" })).not.toBeInTheDocument();
  });

  it("shows the loading state", () => {
    vi.spyOn(usePurchasesModule, "usePurchases").mockReturnValue({
      rows: [], isLoading: true, isError: false,
    } satisfies Purchases);
    renderWithProviders(<PurchasesPageClient role="admin" />);
    expect(screen.getByText("Loading purchases…")).toBeInTheDocument();
  });

  it("shows an error state with a retry option", () => {
    vi.spyOn(usePurchasesModule, "usePurchases").mockReturnValue({
      rows: [], isLoading: false, isError: true,
    } satisfies Purchases);
    renderWithProviders(<PurchasesPageClient role="admin" />);
    expect(screen.getByText(/Couldn't load purchases/)).toBeInTheDocument();
  });
});
