import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import PurchasesPageClient from "./PurchasesPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";
import * as usePurchasesModule from "@/lib/purchasing/usePurchases";
import type { Purchases } from "@/lib/purchasing/usePurchases";

let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: vi.fn() }),
}));

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
    mockSearchParams = new URLSearchParams();
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

  it("does not auto-open the New purchase dialog without ?open=new", () => {
    renderWithProviders(<PurchasesPageClient role="admin" />);
    expect(screen.queryByText("New purchase", { selector: "h4" })).not.toBeInTheDocument();
  });

  it("auto-opens the New purchase dialog when ?open=new is present", () => {
    mockSearchParams = new URLSearchParams("open=new");
    renderWithProviders(<PurchasesPageClient role="admin" />);
    expect(screen.getByText("New purchase", { selector: "h4" })).toBeInTheDocument();
  });

  it("forwards reorder_name from the URL into the dialog's reorder prop", async () => {
    mockSearchParams = new URLSearchParams("open=new&reorder_product=7&reorder_name=Scales%2060kg");
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, options?: RequestInit) => {
        if (url.includes("/suppliers/")) {
          return Promise.resolve({ ok: true, json: async () => ({ count: 1, next: null, previous: null, results: [{ supplier_id: 1, name: "Kigali Electronics Ltd", contact_person: null, phone: null, email: null, address: null }] }) });
        }
        if (url.includes("/purchases/") && options?.method === "POST") {
          return Promise.resolve({ ok: true, json: async () => ({ purchase_id: 9, supplier: 1, employee: 1, invoice_number: null, purchase_date: "2026-08-28", total_paid: "0", total_invoiced: "0", payment_status: "paid", status: "draft", items: [] }) });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
    renderWithProviders(<PurchasesPageClient role="admin" />);
    await screen.findByRole("option", { name: "Kigali Electronics Ltd" });
    await userEvent.selectOptions(screen.getByLabelText("Supplier"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/proxy/purchases/", expect.objectContaining({ method: "POST" })));
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
