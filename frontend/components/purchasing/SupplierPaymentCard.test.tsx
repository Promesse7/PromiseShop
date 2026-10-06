import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupplierPaymentCard } from "./SupplierPaymentCard";
import { ToastProvider } from "@/components/layout/ToastProvider";
import type { Purchase } from "@/lib/types";

const purchase: Purchase = {
  purchase_id: 12, supplier: 3, employee: 1, invoice_number: "KE-1", purchase_date: "2026-09-01",
  total_paid: "500000.00", total_invoiced: "500000.00", payment_status: "partial", status: "received",
  items: [], amount_paid: "200000.00", due_date: null, payment_needs_review: false,
};

function renderCard(p: Purchase = purchase) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SupplierPaymentCard purchase={p} />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("SupplierPaymentCard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          options?.method === "POST" ? { payment_id: 9 } : { count: 0, next: null, previous: null, results: [] },
      })
    ));
  });

  it("shows paid so far and the balance, and records a payment up to it", async () => {
    renderCard();
    expect(screen.getByText("Paid so far").nextSibling).toHaveTextContent("RWF 200,000");
    expect(screen.getByText("Balance").nextSibling).toHaveTextContent("RWF 300,000");
    await userEvent.click(screen.getByRole("button", { name: "Record supplier payment" }));
    expect(screen.getByLabelText("Amount (RWF)")).toHaveValue(300000);
    await userEvent.click(screen.getByRole("button", { name: "Record payment" }));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/payments/supplier/",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ amount: "300000.00", method: "cash", reference: "", note: "", purchase: 12 }) })
    );
  });

  it("offers no payment once fully paid", () => {
    renderCard({ ...purchase, amount_paid: "500000.00", payment_status: "paid" });
    expect(screen.queryByRole("button", { name: "Record supplier payment" })).not.toBeInTheDocument();
  });
});
