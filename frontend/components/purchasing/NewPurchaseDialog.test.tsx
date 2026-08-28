import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NewPurchaseDialog } from "./NewPurchaseDialog";
import { ToastProvider } from "@/components/layout/ToastProvider";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function renderDialog(open = true, reorderProductName?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <NewPurchaseDialog open={open} onClose={() => {}} reorderProductName={reorderProductName} />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("NewPurchaseDialog", () => {
  beforeEach(() => {
    pushMock.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, options?: RequestInit) => {
        if (url.includes("/suppliers/")) {
          return Promise.resolve({
            ok: true,
            json: async () => paginated([{ supplier_id: 1, name: "Kigali Electronics Ltd", contact_person: null, phone: null, email: null, address: null }]),
          });
        }
        if (url.includes("/purchases/") && options?.method === "POST") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              purchase_id: 42, supplier: 1, employee: 2, invoice_number: "KE-8841",
              purchase_date: "2026-08-23", total_paid: "0", total_invoiced: "0",
              payment_status: "paid", status: "draft", items: [],
            }),
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("requires a supplier before submitting", async () => {
    renderDialog();
    await screen.findByText("Kigali Electronics Ltd");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("Supplier is required.")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("creates the purchase and navigates to its workspace on success", async () => {
    renderDialog();
    await screen.findByText("Kigali Electronics Ltd");
    const supplierSelect = screen.getByLabelText("Supplier");
    await userEvent.selectOptions(supplierSelect, "1");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/purchases/42"));
  });

  it("redirects with a prefill query param when a reorder product name was given", async () => {
    renderDialog(true, "Scales 60kg");
    await screen.findByText("Kigali Electronics Ltd");
    await userEvent.selectOptions(screen.getByLabelText("Supplier"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith("/purchases/42?prefill=Scales%2060kg")
    );
  });
});
