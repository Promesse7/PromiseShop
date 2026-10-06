import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CustomerDetailPageClient from "./CustomerDetailPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";

const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });

const customer = { customer_id: 7, name: "Aline Uwase", phone: "0788123456", email: null, address: null, credit_limit: null, balance: "80000.00" };
const openSale = {
  sale_id: 10, customer: 7, employee: 1, sale_date: "2026-08-01T10:00:00Z", payment_method: null,
  total_amount: "100000.00", amount_paid: "20000.00", balance: "80000.00", payment_status: "partial",
  due_date: "2026-08-31", status: "completed", items: [],
};
const payment = {
  payment_id: 4, direction: "in", sale: 10, purchase: null, customer: 7, supplier: null, amount: "20000.00",
  method: "cash", reference: "", paid_at: "2026-08-01T10:00:00Z", recorded_by: 1, recorded_by_name: "Staff",
  note: "", receipt_group: "g", reversal_of: null, is_reversed: false, created_at: "2026-08-01T10:00:00Z",
};
const statement = {
  customer_id: 7, name: "Aline Uwase", phone: "0788123456", from: null, to: null,
  opening_balance: "0.00", closing_balance: "80000.00", current_balance: "80000.00",
  entries: [
    { date: "2026-08-01", kind: "sale", reference: "Sale #10", sale_id: 10, debit: "100000.00", credit: "0.00", balance: "100000.00" },
    { date: "2026-08-01", kind: "payment", reference: "Payment #4", sale_id: 10, debit: "0.00", credit: "20000.00", balance: "80000.00" },
  ],
};

const fetchMock = vi.fn((url: string, options?: RequestInit) => {
  if (url.includes("payments/4/reverse/") && options?.method === "POST") {
    return Promise.resolve({ ok: true, json: async () => ({ ...payment, payment_id: 5, reversal_of: 4 }) });
  }
  if (url.includes("/statement/")) return Promise.resolve({ ok: true, json: async () => statement });
  if (url.includes("sales/?customer=7")) return Promise.resolve({ ok: true, json: async () => page([openSale]) });
  if (url.includes("payments/?customer=7")) return Promise.resolve({ ok: true, json: async () => page([payment]) });
  if (url.includes("customers/7/")) return Promise.resolve({ ok: true, json: async () => customer });
  return Promise.resolve({ ok: true, json: async () => ({}) });
});

function renderPage(canManage = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <CustomerDetailPageClient customerId={7} canManage={canManage} />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("CustomerDetailPageClient", () => {
  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows the balance, open sales, payments and a running statement", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Aline Uwase" })).toBeInTheDocument();
    const strip = screen.getByRole("list", { name: "Customer summary" });
    expect(within(strip).getByText("Balance owed").closest("li")).toHaveTextContent("RWF 80,000");

    await userEvent.click(screen.getByRole("tab", { name: /Sales/ }));
    expect(await screen.findByText("#S-10")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /Statement/ }));
    expect(await screen.findByText("Payment #4")).toBeInTheDocument();
    expect(screen.getByText("Closing balance").nextSibling).toHaveTextContent("RWF 80,000");
  });

  it("lets any role record a payment but only managers change the limit or reverse", async () => {
    renderPage(false);
    await screen.findByRole("heading", { name: "Aline Uwase" });
    expect(screen.getByRole("button", { name: "Record payment" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Change" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Payments/ }));
    expect(await screen.findByText(/Sale #S-10/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reverse" })).not.toBeInTheDocument();
  });

  it("shows the limit and reverse controls to a manager", async () => {
    renderPage(true);
    await screen.findByRole("heading", { name: "Aline Uwase" });
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByLabelText("Limit (blank = none)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Payments/ }));
    expect(await screen.findByRole("button", { name: "Reverse" })).toBeInTheDocument();
  });

  it("asks a manager why before reversing a payment", async () => {
    renderPage(true);
    await screen.findByRole("heading", { name: "Aline Uwase" });
    await userEvent.click(screen.getByRole("tab", { name: /Payments/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Reverse" }));
    await userEvent.type(screen.getByLabelText("Reason"), "Recorded twice");
    await userEvent.click(screen.getByRole("button", { name: "Reverse payment" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/proxy/payments/4/reverse/",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: "Recorded twice" }) })
      )
    );
  });

  it("links back to the customer list", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Aline Uwase" });
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/customers");
  });
});
