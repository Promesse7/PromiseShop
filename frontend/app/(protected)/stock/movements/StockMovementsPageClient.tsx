"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchAllPages } from "@/lib/api-client";
import { useStockMovements } from "@/lib/stock/useStockMovements";
import {
  BUCKET_LABELS,
  MOVEMENT_TYPE_LABELS,
  movementsToCsv,
  type MovementFilters,
} from "@/lib/stock/movements";
import { MovementsTable } from "@/components/stock/MovementsTable";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import type { EmployeeRole, Product, StockBucket, StockMovementType } from "@/lib/types";

// The API caps a page at 500; the ledger page shows (and exports) up to that many rows.
const PAGE_SIZE = 500;
const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];
const SELECT_CLASS = "w-full min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md";

interface StockMovementsPageClientProps {
  role?: EmployeeRole;
}

function downloadCsv(csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stock-movements-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function StockMovementsPageClient({ role }: StockMovementsPageClientProps) {
  const searchParams = useSearchParams();
  const showCost = role != null && ADMIN_ROLES.includes(role);
  const initialProduct = Number(searchParams.get("product")) || null;
  const [filters, setFilters] = useState<MovementFilters>({ product: initialProduct, type: "", bucket: "", from: "", to: "" });
  const productId = useId();
  const typeId = useId();
  const bucketId = useId();

  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => fetchAllPages<Product>("products/"),
  });
  const sortedProducts = useMemo(
    () => [...(products.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [products.data]
  );
  const ledger = useStockMovements(filters, PAGE_SIZE);

  function setFilter<K extends keyof MovementFilters>(key: K, value: MovementFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div>
      <PageHeader title="Stock movements" subtitle="Every change to every stock bucket">
        <Link href="/stock" className="ml-auto text-sm text-accent">
          ← Stock overview
        </Link>
      </PageHeader>
      <Card elevation="sm" className="mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={productId} className="block text-xs text-text/70">Product</label>
            <select
              id={productId}
              value={filters.product ?? ""}
              onChange={(e) => setFilter("product", e.target.value ? Number(e.target.value) : null)}
              className={SELECT_CLASS}
            >
              <option value="">All products</option>
              {sortedProducts.map((p) => (
                <option key={p.product_id} value={p.product_id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={typeId} className="block text-xs text-text/70">Type</label>
            <select
              id={typeId}
              value={filters.type ?? ""}
              onChange={(e) => setFilter("type", e.target.value as StockMovementType | "")}
              className={SELECT_CLASS}
            >
              <option value="">All types</option>
              {(Object.keys(MOVEMENT_TYPE_LABELS) as StockMovementType[]).map((t) => (
                <option key={t} value={t}>{MOVEMENT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={bucketId} className="block text-xs text-text/70">Bucket</label>
            <select
              id={bucketId}
              value={filters.bucket ?? ""}
              onChange={(e) => setFilter("bucket", e.target.value as StockBucket | "")}
              className={SELECT_CLASS}
            >
              <option value="">All buckets</option>
              {(Object.keys(BUCKET_LABELS) as StockBucket[]).map((b) => (
                <option key={b} value={b}>{BUCKET_LABELS[b]}</option>
              ))}
            </select>
          </div>
          <Field label="From" name="from" type="date" value={filters.from ?? ""} onChange={(v) => setFilter("from", v)} />
          <Field label="To" name="to" type="date" value={filters.to ?? ""} onChange={(v) => setFilter("to", v)} />
        </div>
        <div className="flex items-center gap-3 mt-3">
          <span className="text-sm text-text/60">
            {ledger.count > ledger.movements.length
              ? `Showing the latest ${ledger.movements.length} of ${ledger.count} movements`
              : `${ledger.count} movement${ledger.count === 1 ? "" : "s"}`}
          </span>
          <Button
            variant="secondary"
            className="ml-auto"
            disabled={ledger.movements.length === 0}
            onClick={() => downloadCsv(movementsToCsv(ledger.movements, showCost))}
          >
            Export CSV
          </Button>
        </div>
      </Card>
      {ledger.isError ? (
        <ErrorState message="Couldn't load stock movements." />
      ) : ledger.isLoading ? (
        <p className="text-sm text-text/50">Loading movements…</p>
      ) : (
        <Card elevation="sm">
          <MovementsTable movements={ledger.movements} showCost={showCost} emptyMessage="No movements match these filters" />
        </Card>
      )}
    </div>
  );
}
