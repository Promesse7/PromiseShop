import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MoneyAlerts, MoneyDashboard } from "./MoneyDashboard";

const range = { from: "2026-10-01", to: "2026-10-06" };

const responses: Record<string, unknown> = {
  chain: {
    from: range.from, to: range.to,
    steps: [
      { key: "catalog", label: "Sales at catalog price", amount: "482000.00", kind: "total" },
      { key: "operating_profit", label: "Operating profit", amount: "36220.34", kind: "total" },
    ],
    figures: {},
    cogs_estimate: { estimated_value: "0.00", estimated_lines: 0, unknown_lines: 0, note: "" },
    vat: { output_vat: "34779.66", input_vat: "62542.37", net_vat: "-27762.71", label: "Estimate — not a tax filing" },
  },
  leakage: {
    cards: [
      { key: "damaged", label: "Damaged write-offs", value: "400.00", link: "/stock/movements?type=to_damaged" },
    ],
  },
  people: {
    cashiers: [{
      employee_id: 1, name: "Manager One", sales_count: 3, sales_value: "240000.00", discounts: "16000.00",
      avg_discount_pct: "4.40", approvals_received: 0, below_floor_approvals: 0, voids: 1, returns_count: 1,
      returns_value: "110000.00", closes: 0, variance_total: "0.00", worst_variance: null,
    }],
    approvers: [],
  },
  alerts: {
    as_of: range.to,
    alerts: [{ code: "debt_overdue", severity: "danger", message: "100 RWF overdue", link: "/debts" }],
  },
};

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const view = Object.keys(responses).find((key) => url.includes(`/dashboard/${key}/`));
      return Promise.resolve({ ok: true, json: () => Promise.resolve(view ? responses[view] : {}) });
    })
  );
});

describe("MoneyDashboard", () => {
  it("shows the waterfall, the leakage cards with links, and the VAT estimate", async () => {
    renderWithClient(<MoneyDashboard range={range} tab="money" />);
    expect(await screen.findByRole("img", { name: "Money chain waterfall" })).toBeInTheDocument();
    expect(await screen.findByText("Damaged write-offs")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Damaged write-offs/ })).toHaveAttribute(
      "href", "/stock/movements?type=to_damaged"
    );
    expect(screen.getByText("Estimate — not a tax filing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
  });

  it("shows the people view", async () => {
    renderWithClient(<MoneyDashboard range={range} tab="people" />);
    expect(await screen.findByText("Manager One")).toBeInTheDocument();
    expect(screen.getByText("4.40%")).toBeInTheDocument();
  });

  it("lists alerts with a link to act on them", async () => {
    renderWithClient(<MoneyAlerts range={range} />);
    expect(await screen.findByText("100 RWF overdue")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See →" })).toHaveAttribute("href", "/debts");
  });
});
