import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProductMoneyPageClient from "./ProductMoneyPageClient";

const product = {
  product_id: 7, name: "TV", units_bought: 5, avg_cost_paid: "80000.00", avg_cost_invoiced: "82000.00",
  catalog_price: "118000.00", avg_sold_price: "114000.00", vat_per_unit: "17389.83", units_sold: 2,
  revenue: "228000.00", revenue_excl_vat: "193220.34", cogs: "160000.00", actual_margin: "33220.34",
  actual_margin_pct: "17.19", projected_margin_per_unit: "36000.00", units_consumed_internally: 0,
  value_consumed_internally: "0.00", units_damaged: 0, value_damaged: "0.00", in_stock: 3,
  average_cost: "80000.00", stock_value: "240000.00",
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProductMoneyPageClient productId={7} />
    </QueryClientProvider>
  );
}

describe("ProductMoneyPageClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(product) })));
  });

  it("shows the product's money figures for the period", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "TV" })).toBeInTheDocument();
    expect(screen.getByText("Stock value at average cost")).toBeInTheDocument();
    expect(screen.getByText(`RWF ${(240000).toLocaleString()}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
  });

  it("shows the admin/manager notice to staff", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) })));
    renderPage();
    expect(await screen.findByText(/limited to Admin and Manager/)).toBeInTheDocument();
  });

  it("has a back link to the product", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 1, name: "TV" });
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/products/7");
  });
});
