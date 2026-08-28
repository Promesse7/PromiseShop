import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DashboardPageClient from "./DashboardPageClient";
import { useDashboardData, type DashboardData } from "@/lib/dashboard/useDashboardData";

vi.mock("@/lib/dashboard/useDashboardData", () => ({
  useDashboardData: vi.fn(),
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
    expect(screen.getByText("Dashboard data is limited to Admin accounts.")).toBeInTheDocument();
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

  it("shows the setup checklist instead of the KPI dashboard when no purchase has been received yet", () => {
    mockedUseDashboardData.mockReturnValue(baseData({ hasReceivedPurchase: false, categoryCount: 0, productCount: 0 }));
    render(<DashboardPageClient role="admin" />);
    expect(screen.getByText("Let's get your shop set up")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export CSV" })).not.toBeInTheDocument();
  });

  it("shows the normal KPI dashboard once a purchase has been received", () => {
    mockedUseDashboardData.mockReturnValue(baseData());
    render(<DashboardPageClient role="admin" />);
    expect(screen.queryByText("Let's get your shop set up")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
  });
});
