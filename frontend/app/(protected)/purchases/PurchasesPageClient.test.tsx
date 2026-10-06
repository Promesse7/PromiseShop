import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act } from "react";
import { setMatchMedia } from "@/lib/test/matchMedia";
import PurchasesPageClient from "./PurchasesPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";
import * as usePurchasesModule from "@/lib/purchasing/usePurchases";
import type { Purchases } from "@/lib/purchasing/usePurchases";

const pushMock = vi.fn();
const replaceMock = vi.fn();
let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

const rows: Purchases["rows"] = [
  {
    purchase_id: 1, supplier_name: "Kigali Electronics Ltd", invoice_number: "KE-8841",
    purchase_date: "2026-08-23", payment_status: "paid", status: "draft",
    total_paid: "3002000", total_invoiced: "3034000",
  },
  {
    purchase_id: 2, supplier_name: "Dubai Traders FZE", invoice_number: null,
    purchase_date: "2026-08-10", payment_status: "unpaid", status: "received",
    total_paid: "500000", total_invoiced: "500000",
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
    pushMock.mockClear();
    replaceMock.mockClear();
    vi.spyOn(usePurchasesModule, "usePurchases").mockReturnValue({
      rows, isLoading: false, isError: false,
    } satisfies Purchases);
  });

  it("shows the purchase list under a Purchases page heading", () => {
    renderWithProviders(<PurchasesPageClient role="admin" />);
    expect(screen.getByRole("heading", { level: 1, name: "Purchases" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kigali Electronics Ltd" })).toHaveAttribute("href", "/purchases/1");
  });

  it("filters by search text across supplier and invoice number", async () => {
    renderWithProviders(<PurchasesPageClient role="admin" />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search purchases" }), "dubai");
    expect(screen.getByRole("link", { name: "Dubai Traders FZE" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Kigali Electronics Ltd" })).not.toBeInTheDocument();
  });

  it("filters by status", async () => {
    renderWithProviders(<PurchasesPageClient role="admin" />);
    await userEvent.selectOptions(screen.getByLabelText("Status"), "received");
    expect(screen.getByRole("link", { name: "Dubai Traders FZE" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Kigali Electronics Ltd" })).not.toBeInTheDocument();
  });

  it("says nothing matches, with a way to clear the filters, when filters hide every purchase", async () => {
    renderWithProviders(<PurchasesPageClient role="admin" />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search purchases" }), "zzz");
    expect(screen.getByText("No purchases match")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("link", { name: "Kigali Electronics Ltd" })).toBeInTheDocument();
  });

  it("shows an empty state with the New purchase action when there are no purchases", () => {
    vi.spyOn(usePurchasesModule, "usePurchases").mockReturnValue({
      rows: [], isLoading: false, isError: false,
    } satisfies Purchases);
    renderWithProviders(<PurchasesPageClient role="admin" />);
    expect(screen.getByText("No purchases yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "+ New purchase" }).length).toBeGreaterThan(0);
  });

  it("on phone shows cards and moves the filters into a Filters sheet", async () => {
    act(() => setMatchMedia({ desktop: false }));
    renderWithProviders(<PurchasesPageClient role="admin" />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Kigali Electronics Ltd/ })).toHaveAttribute("href", "/purchases/1");
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
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
    await within(screen.getByRole("dialog")).findByRole("option", { name: "Kigali Electronics Ltd" });
    await userEvent.selectOptions(within(screen.getByRole("dialog")).getByLabelText("Supplier"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith("/purchases/9?prefill=Scales%2060kg")
    );
  });

  it("clears the reorder query params from the URL when the dialog is closed", async () => {
    mockSearchParams = new URLSearchParams("open=new&reorder_product=7&reorder_name=Scales%2060kg");
    renderWithProviders(<PurchasesPageClient role="admin" />);
    await screen.findByText("New purchase", { selector: "h4" });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(replaceMock).toHaveBeenCalledWith("/purchases");
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
    expect(screen.getByRole("status", { name: "Loading purchases…" })).toBeInTheDocument();
  });

  it("shows an error state whose Try again re-runs the query", async () => {
    const refetch = vi.fn();
    vi.spyOn(usePurchasesModule, "usePurchases").mockReturnValue({
      rows: [], isLoading: false, isError: true, refetch,
    } satisfies Purchases);
    renderWithProviders(<PurchasesPageClient role="admin" />);
    expect(screen.getByText(/Couldn't load purchases/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });
});
