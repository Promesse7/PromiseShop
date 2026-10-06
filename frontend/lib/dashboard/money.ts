import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

// Money values arrive as decimal strings from the backend (Module H endpoints).
type Money = string;

export interface DateRange {
  from: string;
  to: string;
}

export type PeriodPreset = "today" | "week" | "month" | "last_month" | "custom";

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The date range a preset stands for, as of `today` (local calendar dates). */
export function presetRange(preset: Exclude<PeriodPreset, "custom">, today: Date = new Date()): DateRange {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (preset) {
    case "today":
      return { from: iso(today), to: iso(today) };
    case "week": {
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      return { from: iso(start), to: iso(today) };
    }
    case "month":
      return { from: iso(new Date(y, m, 1)), to: iso(today) };
    case "last_month":
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
  }
}

export interface ChainStep {
  key: string;
  label: string;
  amount: Money;
  kind: "total" | "delta";
}

export interface VatPosition {
  output_vat: Money;
  input_vat: Money;
  net_vat: Money;
  label: string;
}

export interface ChainResponse {
  from: string;
  to: string;
  steps: ChainStep[];
  figures: Record<string, Money | null>;
  cogs_estimate: { estimated_value: Money; estimated_lines: number; unknown_lines: number; note: string };
  vat: VatPosition;
}

export interface LeakageCard {
  key: string;
  label: string;
  value: Money;
  link: string;
  detail?: Record<string, unknown>;
}

export interface LeakageResponse {
  cards: LeakageCard[];
}

export interface MoneySummary {
  sales_count: number;
  net_sales: Money;
  kept_sales: Money;
  average_sale: Money;
  gross_profit: Money;
  gross_margin_pct: Money | null;
  expenses: Money;
  operating_profit: Money;
  customer_debt: Money;
  owed_to_suppliers: Money;
  stock_value: Money;
  vat: VatPosition;
}

export interface CashierRow {
  employee_id: number;
  name: string;
  sales_count: number;
  sales_value: Money;
  discounts: Money;
  avg_discount_pct: Money | null;
  approvals_received: number;
  below_floor_approvals: number;
  voids: number;
  returns_count: number;
  returns_value: Money;
  closes: number;
  variance_total: Money;
  worst_variance: Money | null;
}

export interface ApproverRow {
  employee_id: number;
  name: string;
  approvals_given: number;
  sales: number;
  below_floor: number;
  discount_approved: Money;
}

export interface PeopleResponse {
  cashiers: CashierRow[];
  approvers: ApproverRow[];
}

export interface MoneyAlert {
  code: string;
  severity: "danger" | "warning";
  message: string;
  link: string;
}

export interface AlertsResponse {
  as_of: string;
  alerts: MoneyAlert[];
}

export interface ProductMoney {
  product_id: number;
  name: string;
  units_bought: number;
  avg_cost_paid: Money | null;
  avg_cost_invoiced: Money | null;
  catalog_price: Money | null;
  avg_sold_price: Money | null;
  vat_per_unit: Money | null;
  units_sold: number;
  revenue: Money;
  revenue_excl_vat: Money;
  cogs: Money;
  actual_margin: Money | null;
  actual_margin_pct: Money | null;
  projected_margin_per_unit: Money | null;
  units_consumed_internally: number;
  value_consumed_internally: Money;
  units_damaged: number;
  value_damaged: Money;
  in_stock: number;
  average_cost: Money | null;
  stock_value: Money | null;
}

function rangeQuery(range: DateRange) {
  return `?from=${range.from}&to=${range.to}`;
}

function useMoney<T>(view: string, range: DateRange) {
  return useQuery({
    queryKey: ["dashboard-money", view, range.from, range.to],
    queryFn: () => apiFetch<T>(`dashboard/${view}/${rangeQuery(range)}`),
  });
}

export const useMoneySummary = (range: DateRange) => useMoney<MoneySummary>("summary", range);
export const useMoneyChain = (range: DateRange) => useMoney<ChainResponse>("chain", range);
export const useMoneyLeakage = (range: DateRange) => useMoney<LeakageResponse>("leakage", range);
export const useMoneyPeople = (range: DateRange) => useMoney<PeopleResponse>("people", range);
export const useMoneyAlerts = (range: DateRange) => useMoney<AlertsResponse>("alerts", range);
export const useProductMoney = (productId: number, range: DateRange) =>
  useMoney<ProductMoney>(`products/${productId}`, range);

export function rwf(value: Money | number | null | undefined): string {
  if (value == null) return "—";
  return `RWF ${Math.round(Number(value)).toLocaleString()}`;
}

function cell(value: unknown): string {
  const str = value == null ? "" : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** CSV text from a header row and data rows. */
export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
