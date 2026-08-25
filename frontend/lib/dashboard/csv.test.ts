import { describe, expect, it } from "vitest";
import { buildDashboardCsv } from "./csv";
import type { DashboardData } from "./useDashboardData";
import type { CatalogProduct } from "@/lib/products/useCatalogProducts";

function makeLowStockRow(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    product_id: 1,
    name: "JBL Flip 6",
    brand: "JBL",
    model_number: "FLIP6",
    barcode: "PES-1",
    category_id: 1,
    category_name: "Audio",
    retail_price: 145000,
    wholesale_price: null,
    quantity_in_stock: 2,
    reorder_level: 4,
    status: "low_stock",
    ...overrides,
  };
}

function makeData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    isLoading: false,
    isError: false,
    isForbidden: false,
    salesRevenue: 530000,
    saleCount: 2,
    purchaseCost: 200000,
    purchaseOrderCount: 1,
    grossProfit: 330000,
    grossMarginPct: 0.6226,
    reorderCount: 1,
    outOfStockCount: 0,
    lowStockRows: [makeLowStockRow()],
    topSellers: [{ product_id: 1, product_name: "Samsung TV", units: 3, revenue: 1155000 }],
    slowMovers: [],
    trend: [],
    ...overrides,
  };
}

describe("buildDashboardCsv", () => {
  it("includes a metric header row and every headline stat", () => {
    const csv = buildDashboardCsv(makeData());
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Metric,Value");
    expect(lines).toContain("Sales revenue,530000");
    expect(lines).toContain("Gross profit,330000");
  });

  it("includes a top sellers section with product rows", () => {
    const csv = buildDashboardCsv(makeData());
    expect(csv).toContain("Top sellers");
    expect(csv).toContain("Samsung TV,3,1155000");
  });

  it("includes a low stock section with product rows", () => {
    const csv = buildDashboardCsv(makeData());
    expect(csv).toContain("Low stock / out of stock");
    expect(csv).toContain("JBL Flip 6,2,4");
  });

  it("quotes a product name containing a comma", () => {
    const csv = buildDashboardCsv(
      makeData({ topSellers: [{ product_id: 1, product_name: "Charger, 20W", units: 1, revenue: 12000 }] })
    );
    expect(csv).toContain('"Charger, 20W",1,12000');
  });

  it("renders empty sections without rows when there is no data", () => {
    const csv = buildDashboardCsv(makeData({ topSellers: [], lowStockRows: [] }));
    const lines = csv.split("\n");
    const topSellersHeaderIndex = lines.indexOf("Product,Units,Revenue");
    expect(lines[topSellersHeaderIndex + 1]).toBe("");
  });
});
