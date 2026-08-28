"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, fetchAllPages, ApiError } from "@/lib/api-client";
import { useCatalogProducts, type CatalogProduct } from "@/lib/products/useCatalogProducts";
import type { Sale, Purchase, SalesSummary, StockHealth } from "@/lib/types";

export interface MonthlyTrendPoint {
  month: string;
  label: string;
  revenue: number;
  purchaseCost: number;
}

export interface TopSellerRow {
  product_id: number;
  product_name: string;
  units: number;
  revenue: number;
}

export interface SlowMoverRow {
  product_id: number;
  product_name: string;
  quantity_in_stock: number;
  last_sold: string | null;
}

export interface DashboardData {
  isLoading: boolean;
  isError: boolean;
  isForbidden: boolean;
  hasReceivedPurchase: boolean;
  categoryCount: number;
  productCount: number;
  salesRevenue: number;
  saleCount: number;
  purchaseCost: number;
  purchaseOrderCount: number;
  grossProfit: number;
  grossMarginPct: number;
  reorderCount: number;
  outOfStockCount: number;
  lowStockRows: CatalogProduct[];
  topSellers: TopSellerRow[];
  slowMovers: SlowMoverRow[];
  trend: MonthlyTrendPoint[];
}

const SLOW_MOVER_DAYS = 30;
const TOP_N = 5;
const TREND_MONTHS = 6;

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function trailingMonths(count: number, from: Date): { key: string; label: string }[] {
  const months: { key: string; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(from.getFullYear(), from.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({ key, label: d.toLocaleString("en-US", { month: "short" }) });
  }
  return months;
}

function isForbiddenError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

const emptyData: Omit<DashboardData, "isLoading" | "isError" | "isForbidden"> = {
  hasReceivedPurchase: false,
  categoryCount: 0,
  productCount: 0,
  salesRevenue: 0,
  saleCount: 0,
  purchaseCost: 0,
  purchaseOrderCount: 0,
  grossProfit: 0,
  grossMarginPct: 0,
  reorderCount: 0,
  outOfStockCount: 0,
  lowStockRows: [],
  topSellers: [],
  slowMovers: [],
  trend: [],
};

export function useDashboardData(now: Date = new Date()): DashboardData {
  const currentMonthKey = monthKey(now.toISOString());

  const salesSummary = useQuery({
    queryKey: ["dashboard", "sales-summary", "month"],
    queryFn: () => apiFetch<SalesSummary>("dashboard/sales-summary/?period=month"),
    retry: false,
  });
  const stockHealth = useQuery({
    queryKey: ["dashboard", "stock-health"],
    queryFn: () => apiFetch<StockHealth>("dashboard/stock-health/"),
    retry: false,
  });

  const isForbidden = isForbiddenError(salesSummary.error) || isForbiddenError(stockHealth.error);
  const enableDetail = salesSummary.isSuccess && stockHealth.isSuccess;

  const sales = useQuery({
    queryKey: ["sales"],
    queryFn: () => fetchAllPages<Sale>("sales/"),
    enabled: enableDetail,
  });
  const purchases = useQuery({
    queryKey: ["purchases"],
    queryFn: () => fetchAllPages<Purchase>("purchases/"),
    enabled: enableDetail,
  });
  const catalog = useCatalogProducts();

  const isLoading = salesSummary.isLoading || stockHealth.isLoading || (enableDetail && (sales.isLoading || purchases.isLoading || catalog.isLoading));
  const isError = !isForbidden && (salesSummary.isError || stockHealth.isError || (enableDetail && (sales.isError || purchases.isError || catalog.isError)));

  const data = useMemo(() => {
    if (isForbidden || !enableDetail || !salesSummary.data || !stockHealth.data || !sales.data || !purchases.data) {
      return emptyData;
    }

    const salesRevenue = parseFloat(salesSummary.data.total_revenue);
    const saleCount = salesSummary.data.sale_count;

    const purchasesThisMonth = purchases.data.filter((p) => monthKey(p.purchase_date) === currentMonthKey);
    const purchaseCost = purchasesThisMonth.reduce((sum, p) => sum + parseFloat(p.total_paid ?? "0"), 0);
    const purchaseOrderCount = purchasesThisMonth.length;

    const grossProfit = salesRevenue - purchaseCost;
    const grossMarginPct = salesRevenue > 0 ? grossProfit / salesRevenue : 0;

    const reorderCount = stockHealth.data.low_stock_count;
    const outOfStockCount = catalog.all.filter((p) => p.status === "out_of_stock").length;
    const lowStockRows = [...catalog.all]
      .filter((p) => p.status !== "ok")
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "out_of_stock" ? -1 : 1;
        return a.quantity_in_stock - b.quantity_in_stock;
      })
      .slice(0, TOP_N);

    const productById = new Map(catalog.all.map((p) => [p.product_id, p]));
    const completedSales = sales.data.filter((s) => s.status === "completed");

    const topSellerTotals = new Map<number, { units: number; revenue: number }>();
    for (const sale of completedSales) {
      if (monthKey(sale.sale_date) !== currentMonthKey) continue;
      for (const item of sale.items) {
        const entry = topSellerTotals.get(item.product) ?? { units: 0, revenue: 0 };
        entry.units += item.quantity;
        entry.revenue += parseFloat(item.subtotal);
        topSellerTotals.set(item.product, entry);
      }
    }
    const topSellers: TopSellerRow[] = Array.from(topSellerTotals.entries())
      .map(([product_id, totals]) => ({
        product_id,
        product_name: productById.get(product_id)?.name ?? `Product #${product_id}`,
        units: totals.units,
        revenue: totals.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, TOP_N);

    const lastSoldByProduct = new Map<number, string>();
    for (const sale of completedSales) {
      for (const item of sale.items) {
        const current = lastSoldByProduct.get(item.product);
        if (!current || sale.sale_date > current) {
          lastSoldByProduct.set(item.product, sale.sale_date);
        }
      }
    }
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - SLOW_MOVER_DAYS);
    const slowMovers: SlowMoverRow[] = catalog.all
      .filter((p) => p.quantity_in_stock > 0)
      .map((p) => ({
        product_id: p.product_id,
        product_name: p.name,
        quantity_in_stock: p.quantity_in_stock,
        last_sold: lastSoldByProduct.get(p.product_id) ?? null,
      }))
      .filter((row) => !row.last_sold || new Date(row.last_sold) < cutoff)
      .sort((a, b) => (a.last_sold ?? "").localeCompare(b.last_sold ?? ""))
      .slice(0, TOP_N);

    const trend: MonthlyTrendPoint[] = trailingMonths(TREND_MONTHS, now).map(({ key, label }) => ({
      month: key,
      label,
      revenue: completedSales
        .filter((s) => monthKey(s.sale_date) === key)
        .reduce((sum, s) => sum + parseFloat(s.total_amount), 0),
      purchaseCost: purchases.data
        .filter((p) => monthKey(p.purchase_date) === key)
        .reduce((sum, p) => sum + parseFloat(p.total_paid ?? "0"), 0),
    }));

    return {
      hasReceivedPurchase: purchases.data.some((p) => p.status === "received"),
      categoryCount: catalog.categories.length,
      productCount: catalog.all.length,
      salesRevenue,
      saleCount,
      purchaseCost,
      purchaseOrderCount,
      grossProfit,
      grossMarginPct,
      reorderCount,
      outOfStockCount,
      lowStockRows,
      topSellers,
      slowMovers,
      trend,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isForbidden, enableDetail, salesSummary.data, stockHealth.data, sales.data, purchases.data, catalog.all, currentMonthKey]);

  return { isLoading, isError, isForbidden, ...data };
}
