import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DebtsPageClient from "./DebtsPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";
import { setMatchMedia } from "@/lib/test/matchMedia";

const buckets = { not_due: "0.00", "1_30": "0.00", "31_60": "50000.00", "61_90": "0.00", "90_plus": "0.00" };

const customers = {
  as_of: "2026-10-06", totals: buckets, total: "50000.00",
  rows: [{
    customer_id: 7, name: "Aline Uwase", phone: "0788123456", credit_limit: null, balance: "50000.00",
    open_sales: 2, oldest_due_date: "2026-08-20", overdue: true, buckets,
  }],
};

const suppliers = {
  as_of: "2026-10-06", totals: buckets, total: "500000.00",
  rows: [{
    supplier_id: 3, name: "Kigali Electronics", balance: "500000.00", oldest_due_date: "2026-09-01",
    overdue: true, needs_review: true, buckets,
    open_purchases: [{
      purchase_id: 12, invoice_number: "KE-1", purchase_date: "2026-09-01", due_date: "2026-09-01",
      total: "500000.00", amount_paid: "0.00", balance: "500000.00", needs_review: true,
    }],
  }],
};

function renderPage(canView = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <DebtsPageClient canView={canView} />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("DebtsPageClient", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, options?: RequestInit) => {
        if (options?.method === "POST" && url.includes("payments/customer/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              receipt_group: "abcdef12", customer: 7, amount: "50000.00", balance_after: "0.00",
              payments: [{ payment_id: 1, direction: "in", sale: 10, purchase: null, customer: 7, supplier: null, amount: "50000.00", method: "cash", reference: "", paid_at: "2026-10-06T09:00:00Z", recorded_by: 1, recorded_by_name: "A", note: "", receipt_group: "abcdef12", reversal_of: null, is_reversed: false, created_at: "2026-10-06T09:00:00Z" }],
            }),
          });
        }
        if (url.includes("debts/customers/")) return Promise.resolve({ ok: true, json: async () => customers });
        if (url.includes("debts/suppliers/")) return Promise.resolve({ ok: true, json: async () => suppliers });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );
  });

  it("is limited to admin and manager", () => {
    renderPage(false);
    expect(screen.getByText(/limited to Admin and Manager/)).toBeInTheDocument();
  });

  it("shows aging totals and overdue customers, and records a payment with a receipt", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: "Aline Uwase" })).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("31–60 days")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Record payment" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Record payment" }).at(-1)!);
    expect(await screen.findByText("Payment receipt")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/payments/customer/",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ amount: "50000.00", method: "cash", reference: "", note: "", customer: 7 }) })
    );
  });

  it("lists supplier payables with the migration review flag", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("tab", { name: "We owe suppliers" }));
    expect(await screen.findByText("Kigali Electronics")).toBeInTheDocument();
    expect(screen.getByText("Migrated — confirm amount paid")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm as recorded" })).toBeInTheDocument();
  });

  it("shows the aging totals as a stat strip and switches views with tabs", async () => {
    renderPage();
    expect(await screen.findByRole("list", { name: "Aging totals" })).toHaveTextContent("RWF 50,000");
    expect(screen.getByRole("tab", { name: "Customers owe us" })).toHaveAttribute("aria-selected", "true");
  });

  it("lists customers as tappable cards on a phone, with Record payment on each", async () => {
    setMatchMedia({ desktop: false });
    renderPage();
    const card = (await screen.findByRole("link", { name: "Aline Uwase" })).closest("li")!;
    expect(card).toHaveTextContent("RWF 50,000");
    expect(card.querySelector("button")).toHaveTextContent("Record payment");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
