import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ExpensesPageClient from "./ExpensesPageClient";
import { setMatchMedia } from "@/lib/test/matchMedia";
import { ToastProvider } from "@/components/layout/ToastProvider";

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function renderPage(isAdmin: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ExpensesPageClient isAdmin={isAdmin} />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("ExpensesPageClient", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/expenses/")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                { expense_id: 1, category: "rent", amount: "300000.00", expense_date: "2026-08-01", description: "August rent", recorded_by: 2 },
                { expense_id: 2, category: "utilities", amount: "42000.00", expense_date: "2026-08-15", description: null, recorded_by: 2 },
              ]),
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("shows an admin-only notice and never fetches when not admin", () => {
    renderPage(false);
    expect(screen.getByText(/limited to Admin accounts/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("renders the fetched expenses and their combined total for an admin", async () => {
    renderPage(true);
    await screen.findByText("August rent");
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Rent")).toBeInTheDocument();
    expect(table.getByText("Utilities")).toBeInTheDocument();
    expect(screen.getByText("RWF 342,000")).toBeInTheDocument();
  });

  it("filters by category and updates the total", async () => {
    renderPage(true);
    await screen.findByText("August rent");
    await userEvent.click(screen.getByRole("radio", { name: "Rent" }));
    const table = within(screen.getByRole("table"));
    expect(table.queryByText("Utilities")).not.toBeInTheDocument();
    const totalCard = screen.getByText("Total (filtered)").closest("div")!;
    expect(within(totalCard).getByText("RWF 300,000")).toBeInTheDocument();
  });

  it("opens the create dialog from the toolbar button", async () => {
    renderPage(true);
    await screen.findByText("August rent");
    await userEvent.click(screen.getByRole("button", { name: "+ New expense" }));
    expect(await screen.findByText("New expense")).toBeInTheDocument();
  });

  it("opens the edit dialog pre-filled when Edit is clicked", async () => {
    renderPage(true);
    await screen.findByText("August rent");
    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    await waitFor(() => expect(screen.getByLabelText("Category")).toHaveValue("rent"));
  });

  it("uses the page template with the New expense primary action", async () => {
    renderPage(true);
    expect(await screen.findByRole("heading", { level: 1, name: "Expenses" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ New expense" })).toBeInTheDocument();
  });

  it("on phone, category filters live in the Filters sheet", async () => {
    setMatchMedia({ desktop: false });
    renderPage(true);
    await screen.findByText("August rent");
    expect(screen.queryByRole("radio", { name: "Rent" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(screen.getByRole("radio", { name: "Rent" }));
    expect(screen.getByRole("list", { name: "Expenses" }).querySelectorAll(":scope > li")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Filters (1)" })).toBeInTheDocument();
  });
});
