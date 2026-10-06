import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StockMovementsPageClient from "./StockMovementsPageClient";
import type { EmployeeRole } from "@/lib/types";
import { setMatchMedia } from "@/lib/test/matchMedia";

let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

const movement = {
  movement_id: 1, product: 2, product_name: "JBL Flip 6", movement_type: "sale", bucket: "in_stock",
  quantity_delta: -1, balance_after: 4, unit_cost: "50000.00", source_type: "sale_item", source_id: 1,
  reason: "Sale #1", created_by: 1, created_by_name: "Staff One", created_at: "2026-10-06T10:00:00Z",
};

function renderPage(role: EmployeeRole = "manager") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <StockMovementsPageClient role={role} />
    </QueryClientProvider>
  );
}

function movementUrls(): string[] {
  return vi.mocked(fetch).mock.calls.map((c) => String(c[0])).filter((u) => u.includes("stock/movements"));
}

describe("StockMovementsPageClient", () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("products/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              count: 2, next: null, previous: null,
              results: [
                { product_id: 2, name: "JBL Flip 6" },
                { product_id: 1, name: "Cable" },
              ],
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ count: 1, next: null, previous: null, results: [movement] }),
        });
      })
    );
  });

  it("lists ledger rows with cost for a manager", async () => {
    renderPage("manager");
    expect(await screen.findByText("Sale #1")).toBeInTheDocument();
    expect(screen.getByText("Unit cost")).toBeInTheDocument();
    expect(screen.getByText("1 movement")).toBeInTheDocument();
  });

  it("hides cost from staff", async () => {
    renderPage("sales_staff");
    await screen.findByText("Sale #1");
    expect(screen.queryByText("Unit cost")).not.toBeInTheDocument();
  });

  it("starts filtered by the product in the URL", async () => {
    mockSearchParams = new URLSearchParams("product=2");
    renderPage();
    await screen.findByText("Sale #1");
    expect(movementUrls()[0]).toContain("product=2");
  });

  it("refetches when a filter changes", async () => {
    renderPage();
    await screen.findByText("Sale #1");
    await userEvent.selectOptions(screen.getByLabelText("Type"), "to_damaged");
    await userEvent.selectOptions(screen.getByLabelText("Bucket"), "damaged");
    await waitFor(() =>
      expect(movementUrls().some((u) => u.includes("type=to_damaged") && u.includes("bucket=damaged"))).toBe(true)
    );
  });

  it("offers a CSV export of the loaded rows", async () => {
    const createObjectURL = vi.fn(() => "blob:x");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderPage();
    await screen.findByText("Sale #1");
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Export CSV" }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it("collapses the five filters into a Filters sheet on phone", async () => {
    setMatchMedia({ desktop: false });
    mockSearchParams = new URLSearchParams("type=to_damaged");
    renderPage();
    // Phone cards show the change and balance, not the free-text reason.
    await screen.findByText("-1");
    expect(screen.queryByLabelText("Type")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filters (1)" })).toBeInTheDocument();
  });

  it("links back to the stock overview", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/stock");
  });
});
