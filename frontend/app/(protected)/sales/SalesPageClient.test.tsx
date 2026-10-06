import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SalesPageClient from "./SalesPageClient";

const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });

const sale = {
  sale_id: 41, customer: null, customer_name: null, employee: 3, employee_name: "Staff One",
  sale_date: "2026-10-06T08:30:00Z", payment_method: "cash", total_amount: "300.00", amount_paid: "100.00",
  balance: "200.00", returned_amount: "0.00", discount_total: "10.00", status: "partially_returned", items: [],
};

const fetchMock = vi.fn((url: string) => {
  if (url.includes("customers/")) return Promise.resolve({ ok: true, json: async () => page([]) });
  if (url.includes("sales/")) return Promise.resolve({ ok: true, json: async () => page([sale]) });
  return Promise.resolve({ ok: true, json: async () => ({}) });
});

function renderPage(canSeeAll: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SalesPageClient canSeeAll={canSeeAll} />
    </QueryClientProvider>
  );
}

describe("SalesPageClient", () => {
  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("lists sales with links, cashier, status and flags", async () => {
    renderPage(true);
    const link = await screen.findByRole("link", { name: "#S-41" });
    expect(link).toHaveAttribute("href", "/sales/41");
    expect(screen.getByText("Partly returned", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Discount")).toBeInTheDocument();
    expect(screen.getByText("Owes 200")).toBeInTheDocument();
  });

  it("sends the chosen filters to the backend", async () => {
    renderPage(true);
    await screen.findByRole("link", { name: "#S-41" });
    await userEvent.click(screen.getByLabelText("Has return"));
    await userEvent.selectOptions(screen.getByLabelText("Payment method"), "mobile_money");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("sales/?payment_method=mobile_money&has_return=true&page=1"),
        expect.anything()
      )
    );
  });

  it("shows staff their own day without the filters", async () => {
    renderPage(false);
    expect(await screen.findByRole("heading", { name: "My sales today" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Sales filters")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Close day →" })).toHaveAttribute("href", "/close-day");
  });
});
