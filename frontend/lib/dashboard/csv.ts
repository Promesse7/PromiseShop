import type { DashboardData } from "./useDashboardData";

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function row(cells: (string | number)[]): string {
  return cells.map(escapeCsvCell).join(",");
}

export function buildDashboardCsv(data: DashboardData): string {
  const lines: string[] = [];

  lines.push(row(["Metric", "Value"]));
  lines.push(row(["Sales revenue", data.salesRevenue]));
  lines.push(row(["Purchase cost", data.purchaseCost]));
  lines.push(row(["Gross profit", data.grossProfit]));
  lines.push(row(["Gross margin %", (data.grossMarginPct * 100).toFixed(1)]));
  lines.push(row(["Needs reorder", data.reorderCount]));
  lines.push(row(["Out of stock", data.outOfStockCount]));
  lines.push("");

  lines.push(row(["Top sellers"]));
  lines.push(row(["Product", "Units", "Revenue"]));
  for (const seller of data.topSellers) {
    lines.push(row([seller.product_name, seller.units, seller.revenue]));
  }
  lines.push("");

  lines.push(row(["Low stock / out of stock"]));
  lines.push(row(["Product", "On hand", "Reorder at"]));
  for (const item of data.lowStockRows) {
    lines.push(row([item.name, item.quantity_in_stock, item.reorder_level]));
  }

  return lines.join("\n");
}
