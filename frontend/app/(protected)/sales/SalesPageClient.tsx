"use client";

import { SharedElement, sharedName } from "@/components/ui/SharedElement";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchAllPages } from "@/lib/api-client";
import { EMPTY_SALES_FILTERS, PAGE_SIZE, useSalesHistory, type SalesFilters } from "@/lib/sales/useSalesHistory";
import { PAYMENT_METHOD_LABELS } from "@/lib/pos/payments";
import { SaleStatusTag } from "@/components/sales/SaleStatusTag";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Page, Toolbar } from "@/components/ui/Page";
import { Tag } from "@/components/ui/Tag";
import { formatRwf } from "@/lib/format";
import type { Customer, PaymentMethod, Sale } from "@/lib/types";
import { Receipt } from "lucide-react";

interface SalesPageClientProps {
  // Admin and manager see every sale and every filter; staff see their own sales from today.
  canSeeAll: boolean;
  /** Filters preset from the URL (dashboard leakage links). */
  initialFilters?: Partial<SalesFilters>;
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const SELECT = "min-h-9 py-1.5 px-2 text-sm text-text bg-surface border border-divider rounded-md";

export default function SalesPageClient({ canSeeAll, initialFilters }: SalesPageClientProps) {
  const [filters, setFilters] = useState<SalesFilters>({ ...EMPTY_SALES_FILTERS, ...initialFilters });
  const [page, setPage] = useState(1);
  const sales = useSalesHistory(filters, page);
  const customers = useQuery({
    queryKey: ["customers", "all"],
    queryFn: () => fetchAllPages<Customer>("customers/"),
    enabled: canSeeAll,
  });

  // Cashiers seen in the loaded page (the employee list is admin-only); the chosen one is kept.
  const cashiers = useMemo(() => {
    const seen = new Map<number, string>();
    for (const s of sales.data?.results ?? []) seen.set(s.employee, s.employee_name ?? `Employee #${s.employee}`);
    return Array.from(seen.entries());
  }, [sales.data]);

  function set<K extends keyof SalesFilters>(key: K, value: SalesFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  const columns: DataColumn<Sale>[] = [
    {
      key: "receipt",
      header: "Receipt",
      primary: true,
      sortValue: (s) => s.sale_id,
      render: (s) => (
        <SharedElement name={sharedName("sale", s.sale_id)}>
          <span className="font-mono">#S-{s.sale_id}</span>
        </SharedElement>
      ),
    },
    { key: "date", header: "Date", mobile: true, sortValue: (s) => s.sale_date, render: (s) => when(s.sale_date) },
    { key: "cashier", header: "Cashier", render: (s) => s.employee_name ?? `#${s.employee}` },
    { key: "customer", header: "Customer", render: (s) => s.customer_name ?? "Walk-in" },
    { key: "total_amount", header: "Total", money: true, mobile: true, sortValue: (s) => Number(s.total_amount) },
    { key: "amount_paid", header: "Paid", money: true, sortValue: (s) => Number(s.amount_paid ?? 0) },
    {
      key: "status",
      header: "Status",
      mobile: true,
      render: (s) => (
        <span className="flex flex-wrap gap-1">
          <SaleStatusTag status={s.status} />
          {Number(s.discount_total ?? 0) > 0 && <Tag variant="outline">Discount</Tag>}
          {Number(s.balance ?? 0) > 0 && s.status !== "voided" && <Tag variant="warning">Owes {formatRwf(s.balance)}</Tag>}
        </span>
      ),
    },
  ];

  const activeFilterCount = (Object.keys(EMPTY_SALES_FILTERS) as (keyof SalesFilters)[]).filter(
    (key) => filters[key] !== EMPTY_SALES_FILTERS[key]
  ).length;

  const count = sales.data?.count ?? 0;
  const lastPage = Math.max(1, Math.ceil(count / PAGE_SIZE));


  const filterControls = canSeeAll ? (
    <div className="flex flex-wrap items-end gap-3" aria-label="Sales filters">
      <label className="flex flex-col gap-1 text-xs text-text/70">
        From
        <input type="date" aria-label="From" value={filters.from} onChange={(e) => set("from", e.target.value)} className={SELECT} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-text/70">
        To
        <input type="date" aria-label="To" value={filters.to} onChange={(e) => set("to", e.target.value)} className={SELECT} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-text/70">
        Cashier
        <select aria-label="Cashier" value={filters.cashier} onChange={(e) => set("cashier", e.target.value)} className={SELECT}>
          <option value="">All</option>
          {cashiers.map(([id, name]) => (
            <option key={id} value={String(id)}>{name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-text/70">
        Customer
        <select aria-label="Customer" value={filters.customer} onChange={(e) => set("customer", e.target.value)} className={SELECT}>
          <option value="">All</option>
          {(customers.data ?? []).map((c) => (
            <option key={c.customer_id} value={String(c.customer_id)}>{c.name ?? `#${c.customer_id}`}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-text/70">
        Payment
        <select aria-label="Payment status" value={filters.payment_status} onChange={(e) => set("payment_status", e.target.value)} className={SELECT}>
          <option value="">Any</option>
          <option value="paid">Paid</option>
          <option value="partial">Partly paid</option>
          <option value="credit">On credit</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-text/70">
        Method
        <select aria-label="Payment method" value={filters.payment_method} onChange={(e) => set("payment_method", e.target.value)} className={SELECT}>
          <option value="">Any</option>
          {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
            <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-text/70">
        Status
        <select aria-label="Status" value={filters.status} onChange={(e) => set("status", e.target.value as SalesFilters["status"])} className={SELECT}>
          <option value="">Any</option>
          <option value="completed">Completed</option>
          <option value="partially_returned">Partly returned</option>
          <option value="returned">Returned</option>
          <option value="voided">Voided</option>
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-sm">
        <input type="checkbox" checked={filters.has_discount} onChange={(e) => set("has_discount", e.target.checked)} />
        Has discount
      </label>
      <label className="flex items-center gap-1.5 text-sm">
        <input type="checkbox" checked={filters.has_return} onChange={(e) => set("has_return", e.target.checked)} />
        Has return
      </label>
      <Button variant="ghost" onClick={() => { setFilters(EMPTY_SALES_FILTERS); setPage(1); }}>
        Clear
      </Button>
    </div>
  ) : undefined;

  return (
    <Page
      title={canSeeAll ? "Sales" : "My sales today"}
      description={canSeeAll ? "Every sale, its payments and returns" : "Sales you made today"}
      primaryAction={<Button href="/checkout">+ New sale</Button>}
      toolbar={
        <Toolbar
          filters={filterControls}
          activeFilterCount={activeFilterCount}
          trailing={
            <Link href="/close-day" className="text-sm text-accent hover:underline">
              Close day →
            </Link>
          }
        />
      }
    >
      {sales.isError ? (
        <ErrorState message="Couldn't load sales." onRetry={() => sales.refetch()} />
      ) : sales.isLoading ? (
        <LoadingState variant="table" />
      ) : (
        <div className="flex flex-col gap-3">
          <DataTable
            label="Sales"
            columns={columns}
            rows={sales.data?.results ?? []}
            rowKey={(s) => String(s.sale_id)}
            rowHref={(s) => `/sales/${s.sale_id}`}
            empty={<EmptyState icon={Receipt} title="No sales match" message="Try clearing a filter or widening the dates." />}
          />
          <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
            <span className="text-text/60">
              {count} sale{count === 1 ? "" : "s"} · page {page} of {lastPage}
            </span>
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="secondary" disabled={page >= lastPage} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </Page>
  );
}
