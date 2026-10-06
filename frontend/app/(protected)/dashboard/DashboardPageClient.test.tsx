import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DashboardPageClient from "./DashboardPageClient";
import { useDashboardData, type DashboardData } from "@/lib/dashboard/useDashboardData";

vi.mock("@/lib/dashboard/useDashboardData", () => ({
  useDashboardData: vi.fn(),
}));

// The money views fetch on their own; they have their own tests.
vi.mock("@/components/dashboard/MoneyDashboard", () => ({
  MoneyAlerts: () => <div>alerts</div>,
  MoneyDashboard: ({ tab }: { tab: string }) => <div>money view: {tab}</div>,
}));

const mockedUseDashboardData = vi.mocked(useDashboardData);

function baseData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    isLoading: false,
    isError: false,
    isForbidden: false,
    hasReceivedPurchase: true,
    categoryCount: 3,
    productCount: 10,
    salesRevenue: 530000,
    saleCount: 2,
    purchaseCost: 200000,
    purchaseOrderCount: 1,
    grossProfit: 330000,
    grossMarginPct: 0.62,
    reorderCount: 1,
    outOfStockCount: 0,
    lowStockRows: [],
    topSellers: [],
    slowMovers: [],
    trend: [],
    profitability: null,
    ...overrides,
  };
}

describe("DashboardPageClient", () => {
  it("shows a loading state", () => {
    mockedUseDashboardData.mockReturnValue(baseData({ isLoading: true }));
    render(<DashboardPageClient role="admin" />);
    expect(screen.getByRole("status", { name: "Loading dashboard…" })).toBeInTheDocument();
  });

  it("shows the admin-only notice when forbidden", () => {
    mockedUseDashboardData.mockReturnValue(baseData({ isForbidden: true }));
    render(<DashboardPageClient role="admin" />);
    expect(screen.getByText("Dashboard data is limited to Admin and Manager accounts.")).toBeInTheDocument();
  });

  it("shows a retry option on error", () => {
    mockedUseDashboardData.mockReturnValue(baseData({ isError: true }));
    render(<DashboardPageClient role="admin" />);
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("renders stat cards and an export button once loaded", () => {
    mockedUseDashboardData.mockReturnValue(baseData());
    render(<DashboardPageClient role="admin" />);
    expect(screen.getByText("RWF 530,000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
  });

  it("renders the KPI dashboard even before the first purchase is received (setup steps live in the guidance bar)", () => {
    mockedUseDashboardData.mockReturnValue(baseData({ hasReceivedPurchase: false, categoryCount: 0, productCount: 0 }));
    render(<DashboardPageClient role="admin" />);
    expect(screen.queryByText("Let's get your shop set up")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
  });

  it("shows the normal KPI dashboard once a purchase has been received", () => {
    mockedUseDashboardData.mockReturnValue(baseData());
    render(<DashboardPageClient role="admin" />);
    expect(screen.queryByText("Let's get your shop set up")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
  });

  it("shows alerts above every tab and switches to the money chain and people views with a period picker", async () => {
    const userEvent = (await import("@testing-library/user-event")).default;
    mockedUseDashboardData.mockReturnValue(baseData());
    render(<DashboardPageClient role="manager" />);
    expect(screen.getByText("alerts")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Last month" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Money chain" }));
    expect(screen.getByText("money view: money")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Last month" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "People" }));
    expect(screen.getByText("money view: people")).toBeInTheDocument();
  });
});
