import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatCards } from "./StatCards";
import type { DashboardData } from "@/lib/dashboard/useDashboardData";

function makeData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    isLoading: false,
    isError: false,
    isForbidden: false,
    salesRevenue: 12480000,
    saleCount: 9,
    purchaseCost: 8150000,
    purchaseOrderCount: 14,
    grossProfit: 4330000,
    grossMarginPct: 0.347,
    reorderCount: 7,
    outOfStockCount: 3,
    lowStockRows: [],
    topSellers: [],
    slowMovers: [],
    trend: [],
    ...overrides,
  };
}

describe("StatCards", () => {
  it("renders formatted currency for revenue, cost and profit", () => {
    render(<StatCards data={makeData()} />);
    expect(screen.getByText("RWF 12,480,000")).toBeInTheDocument();
    expect(screen.getByText("RWF 8,150,000")).toBeInTheDocument();
    expect(screen.getByText("RWF 4,330,000")).toBeInTheDocument();
  });

  it("renders the reorder count and out-of-stock sub-detail", () => {
    render(<StatCards data={makeData()} />);
    expect(screen.getByText("7 products")).toBeInTheDocument();
    expect(screen.getByText("3 out of stock")).toBeInTheDocument();
  });

  it("renders the gross margin percentage", () => {
    render(<StatCards data={makeData()} />);
    expect(screen.getByText(/34\.7% margin/)).toBeInTheDocument();
  });
});
