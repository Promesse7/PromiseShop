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
    render(<DashboardPageClient />);
    expect(screen.getByText("Loading dashboard…")).toBeInTheDocument();
  });

  it("shows the admin-only notice when forbidden", () => {
    mockedUseDashboardData.mockReturnValue(baseData({ isForbidden: true }));
    render(<DashboardPageClient />);
    expect(screen.getByText("Dashboard data is limited to Admin accounts.")).toBeInTheDocument();
  });

  it("shows a retry option on error", () => {
    mockedUseDashboardData.mockReturnValue(baseData({ isError: true }));
    render(<DashboardPageClient />);
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("renders stat cards and an export button once loaded", () => {
    mockedUseDashboardData.mockReturnValue(baseData());
    render(<DashboardPageClient />);
    expect(screen.getByText("RWF 530,000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
  });
});
