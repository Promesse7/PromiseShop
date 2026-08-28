import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import PurchaseWorkspaceClient from "./PurchaseWorkspaceClient";
import { ToastProvider } from "@/components/layout/ToastProvider";
import * as usePurchaseDetailModule from "@/lib/purchasing/usePurchaseDetail";
import * as useSuppliersModule from "@/lib/suppliers/useSuppliers";
import type { PurchaseDetail } from "@/lib/purchasing/usePurchaseDetail";
import type { Suppliers } from "@/lib/suppliers/useSuppliers";
import type { EmployeeRole, Purchase } from "@/lib/types";

const pushMock = vi.fn();
let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => mockSearchParams,
}));

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function draftPurchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    purchase_id: 7, supplier: 1, employee: 2, invoice_number: "KE-8841", purchase_date: "2026-08-23",
    total_paid: "0", total_invoiced: "0", payment_status: "paid", status: "draft", items: [],
    ...overrides,
  };
}

function renderWorkspace(role: EmployeeRole = "admin") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <PurchaseWorkspaceClient purchaseId={7} role={role} />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("PurchaseWorkspaceClient", () => {
  beforeEach(() => {
    pushMock.mockClear();
    mockSearchParams = new URLSearchParams();
    vi.spyOn(useSuppliersModule, "useSuppliers").mockReturnValue({
      all: [{ supplier_id: 1, name: "Kigali Electronics Ltd", contact_person: null, phone: null, email: null, address: null }],
      isLoading: false, isError: false,
    } satisfies Suppliers);
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/products/")) return Promise.resolve({ ok: true, json: async () => paginated([]) });
        if (url.includes("/categories/")) return Promise.resolve({ ok: true, json: async () => paginated([]) });
        if (url.includes("/receive/")) {
          return Promise.resolve({ ok: true, json: async () => draftPurchase({ status: "received" }) });
        }
        if (url.includes("/cancel/")) {
          return Promise.resolve({ ok: true, json: async () => draftPurchase({ status: "cancelled" }) });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("renders the supplier name, invoice/date, and a Draft status tag", () => {
    vi.spyOn(usePurchaseDetailModule, "usePurchaseDetail").mockReturnValue({
      purchase: draftPurchase(), isLoading: false, isError: false,
    } satisfies PurchaseDetail);
    renderWorkspace();
    expect(screen.getByText("Kigali Electronics Ltd")).toBeInTheDocument();
    expect(screen.getByText(/KE-8841/)).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("toggles between Single and Bulk add forms", async () => {
    vi.spyOn(usePurchaseDetailModule, "usePurchaseDetail").mockReturnValue({
      purchase: draftPurchase(), isLoading: false, isError: false,
    } satisfies PurchaseDetail);
    renderWorkspace();
    expect(screen.getByPlaceholderText("Search catalog first — reuse if it exists…")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Bulk" }));
    expect(screen.getByRole("button", { name: "Print all new labels" })).toBeInTheDocument();
  });

  it("passes ?prefill= through to the single-add form's search box", () => {
    mockSearchParams = new URLSearchParams("prefill=Scales%2060kg");
    vi.spyOn(usePurchaseDetailModule, "usePurchaseDetail").mockReturnValue({
      purchase: draftPurchase(), isLoading: false, isError: false,
    } satisfies PurchaseDetail);
    renderWorkspace();
    expect(screen.getByLabelText("Search catalog first — reuse if it exists…")).toHaveValue("Scales 60kg");
  });

  it("disables Receive with zero items", () => {
    vi.spyOn(usePurchaseDetailModule, "usePurchaseDetail").mockReturnValue({
      purchase: draftPurchase(), isLoading: false, isError: false,
    } satisfies PurchaseDetail);
    renderWorkspace();
    expect(screen.getByRole("button", { name: "Receive purchase → stock increases" })).toBeDisabled();
  });

  it("confirms then receives the purchase when there are items", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(usePurchaseDetailModule, "usePurchaseDetail").mockReturnValue({
      purchase: draftPurchase({
        items: [{ purchase_item_id: 1, purchase: 7, product: 3, quantity: 1, unit_cost_paid: "1", unit_cost_invoiced: "1", price_discrepancy_note: "", subtotal_paid: "1", subtotal_invoiced: "1" }],
      }),
      isLoading: false, isError: false,
    } satisfies PurchaseDetail);
    renderWorkspace();

    const receiveButton = screen.getByRole("button", { name: "Receive purchase → stock increases" });
    expect(receiveButton).not.toBeDisabled();
    await userEvent.click(receiveButton);

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/proxy/purchases/7/receive/", expect.objectContaining({ method: "POST" }))
    );
  });

  it("hides the add-product section and Receive/Save-draft actions once received", () => {
    vi.spyOn(usePurchaseDetailModule, "usePurchaseDetail").mockReturnValue({
      purchase: draftPurchase({ status: "received" }), isLoading: false, isError: false,
    } satisfies PurchaseDetail);
    renderWorkspace();
    expect(screen.getByText("Received")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search catalog first — reuse if it exists…")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Receive purchase → stock increases" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
  });

  it("Save draft navigates back to the purchases list", async () => {
    vi.spyOn(usePurchaseDetailModule, "usePurchaseDetail").mockReturnValue({
      purchase: draftPurchase(), isLoading: false, isError: false,
    } satisfies PurchaseDetail);
    renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(pushMock).toHaveBeenCalledWith("/purchases");
  });

  it("shows the loading state", () => {
    vi.spyOn(usePurchaseDetailModule, "usePurchaseDetail").mockReturnValue({
      purchase: undefined, isLoading: true, isError: false,
    } satisfies PurchaseDetail);
    renderWorkspace();
    expect(screen.getByText("Loading purchase…")).toBeInTheDocument();
  });

  it("shows an error state with a retry option", () => {
    vi.spyOn(usePurchaseDetailModule, "usePurchaseDetail").mockReturnValue({
      purchase: undefined, isLoading: false, isError: true,
    } satisfies PurchaseDetail);
    renderWorkspace();
    expect(screen.getByText(/Couldn't load this purchase/)).toBeInTheDocument();
  });

  it("shows a Cancel purchase button for admin on a draft purchase", () => {
    vi.spyOn(usePurchaseDetailModule, "usePurchaseDetail").mockReturnValue({
      purchase: draftPurchase(), isLoading: false, isError: false,
    } satisfies PurchaseDetail);
    renderWorkspace("admin");
    expect(screen.getByRole("button", { name: "Cancel purchase" })).toBeInTheDocument();
  });

  it("shows a Cancel purchase button for manager on a received purchase", () => {
    vi.spyOn(usePurchaseDetailModule, "usePurchaseDetail").mockReturnValue({
      purchase: draftPurchase({ status: "received" }), isLoading: false, isError: false,
    } satisfies PurchaseDetail);
    renderWorkspace("manager");
    expect(screen.getByRole("button", { name: "Cancel purchase" })).toBeInTheDocument();
  });

  it("hides the Cancel purchase button for sales_staff", () => {
    vi.spyOn(usePurchaseDetailModule, "usePurchaseDetail").mockReturnValue({
      purchase: draftPurchase(), isLoading: false, isError: false,
    } satisfies PurchaseDetail);
    renderWorkspace("sales_staff");
    expect(screen.queryByRole("button", { name: "Cancel purchase" })).not.toBeInTheDocument();
  });

  it("hides the Cancel purchase button once already cancelled", () => {
    vi.spyOn(usePurchaseDetailModule, "usePurchaseDetail").mockReturnValue({
      purchase: draftPurchase({ status: "cancelled" }), isLoading: false, isError: false,
    } satisfies PurchaseDetail);
    renderWorkspace("admin");
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel purchase" })).not.toBeInTheDocument();
  });

  it("confirms then cancels the purchase when Cancel purchase is clicked", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(usePurchaseDetailModule, "usePurchaseDetail").mockReturnValue({
      purchase: draftPurchase(), isLoading: false, isError: false,
    } satisfies PurchaseDetail);
    renderWorkspace("admin");

    await userEvent.click(screen.getByRole("button", { name: "Cancel purchase" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/proxy/purchases/7/cancel/", expect.objectContaining({ method: "POST" }))
    );
  });

  it("does not cancel when the confirmation is dismissed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    vi.spyOn(usePurchaseDetailModule, "usePurchaseDetail").mockReturnValue({
      purchase: draftPurchase(), isLoading: false, isError: false,
    } satisfies PurchaseDetail);
    renderWorkspace("admin");

    await userEvent.click(screen.getByRole("button", { name: "Cancel purchase" }));

    expect(fetch).not.toHaveBeenCalledWith("/api/proxy/purchases/7/cancel/", expect.anything());
  });
});
