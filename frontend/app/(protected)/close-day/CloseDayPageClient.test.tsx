import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CloseDayPageClient from "./CloseDayPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";

const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });
const empty = { in: "0.00", out: "0.00", net: "0.00", references: [] };
const preview = {
  cashier: 3, cashier_name: "Staff One", business_date: "2026-10-06", opening_float: "0.00",
  expected_cash: "1100.00",
  by_method: { cash: { in: "1100.00", out: "0.00", net: "1100.00", references: [] }, mobile_money: empty, card: empty, bank_transfer: empty },
  sales_count: 1, sales_total: "1100.00", voided_count: 0, discounts_given: "0.00", returns_count: 0,
  returns_refunded: "0.00", returns_paid_out: "0.00", debt_collected: "0.00", new_credit: "0.00", already_closed: false,
};
const closed = {
  close_id: 9, cashier: 3, cashier_name: "Staff One", business_date: "2026-10-06", opening_float: "0.00",
  expected_cash: "1100.00", expected_by_method: preview.by_method, summary: preview, counted_cash: "1080.00",
  variance: "-20.00", note: "", closed_by: 2, closed_by_name: "Manager One", closed_at: "2026-10-06T18:00:00Z",
};

const fetchMock = vi.fn((url: string, options?: RequestInit) => {
  if (url.includes("daily-close/preview/")) return Promise.resolve({ ok: true, json: async () => preview });
  if (url.endsWith("daily-close/") && options?.method === "POST") return Promise.resolve({ ok: true, json: async () => closed });
  if (url.includes("daily-close/")) return Promise.resolve({ ok: true, json: async () => page([closed]) });
  return Promise.resolve({ ok: true, json: async () => page([]) });
});

function renderPage(role: "sales_staff" | "manager") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <CloseDayPageClient role={role} />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("CloseDayPageClient", () => {
  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows expected cash, the variance as you type, and needs a manager PIN", async () => {
    renderPage("sales_staff");
    expect(await screen.findByText("RWF 1,100", { selector: "strong" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Counted cash (RWF)"), "1080");
    expect(screen.getByText("Variance: RWF -20")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close day" }));
    expect(screen.getByText(/must confirm with their username and PIN/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Manager username"), "manager1");
    await userEvent.type(screen.getByLabelText("Manager PIN"), "4321");
    await userEvent.click(screen.getByRole("button", { name: "Close day" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, options]) => options?.method === "POST");
      expect(post).toBeDefined();
      const body = JSON.parse(String(post![1]!.body));
      expect(body).toMatchObject({
        opening_float: "0.00", counted_cash: "1080.00",
        approval: { approver_username: "manager1", pin: "4321" },
      });
      expect(body.cashier).toBeUndefined();
    });
    expect(await screen.findByText(/can't be reopened/)).toBeInTheDocument();
    expect(screen.getByText("Confirmed by").nextSibling).toHaveTextContent("Manager One");
  });

  it("lists closed days with their variance for a manager, but not for staff", async () => {
    renderPage("manager");
    expect(await screen.findByText("Closed days")).toBeInTheDocument();
    expect(await screen.findByText("RWF -20", { selector: "span" })).toBeInTheDocument();
  });
});
