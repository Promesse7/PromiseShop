"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Truck } from "lucide-react";
import { usePurchases } from "@/lib/purchasing/usePurchases";
import {
  NO_PURCHASE_FILTERS,
  countActiveFilters,
  filterPurchases,
  type PurchaseFilters,
} from "@/lib/purchasing/filterPurchases";
import { PurchaseTable, PAYMENT_LABEL } from "@/components/purchasing/PurchaseTable";
import { NewPurchaseDialog } from "@/components/purchasing/NewPurchaseDialog";
import { Button } from "@/components/ui/Button";
import { Page, Toolbar } from "@/components/ui/Page";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterSelect, SearchInput } from "@/components/purchasing/ListControls";
import type { EmployeeRole } from "@/lib/types";

const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];

const PAYMENT_OPTIONS = Object.entries(PAYMENT_LABEL).map(([value, label]) => ({ value, label }));

interface PurchasesPageClientProps {
  role: EmployeeRole;
}

export default function PurchasesPageClient({ role }: PurchasesPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const purchases = usePurchases();
  const isAdmin = ADMIN_ROLES.includes(role);
  const [createOpen, setCreateOpen] = useState(searchParams.get("open") === "new");
  const [filters, setFilters] = useState<PurchaseFilters>(NO_PURCHASE_FILTERS);
  const reorderProductName = searchParams.get("reorder_name") ?? undefined;

  const visibleRows = useMemo(() => filterPurchases(purchases.rows, filters), [purchases.rows, filters]);
  const supplierOptions = useMemo(
    () =>
      [...new Set(purchases.rows.map((r) => r.supplier_name))]
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ value: name, label: name })),
    [purchases.rows]
  );

  const newPurchaseButton = <Button onClick={() => setCreateOpen(true)}>+ New purchase</Button>;
  const isFiltered = filters.search.trim() !== "" || countActiveFilters(filters) > 0;

  function update<K extends keyof PurchaseFilters>(key: K, value: PurchaseFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  let content;
  if (purchases.isError) {
    content = <ErrorState message="Couldn't load purchases." onRetry={purchases.refetch} />;
  } else if (purchases.isLoading) {
    content = <LoadingState variant="table" label="Loading purchases…" />;
  } else {
    content = (
      <PurchaseTable
        rows={visibleRows}
        showTotals={isAdmin}
        empty={
          isFiltered ? (
            <EmptyState
              icon={Truck}
              title="No purchases match"
              message="Try a different search or filter."
              action={
                <Button variant="secondary" onClick={() => setFilters(NO_PURCHASE_FILTERS)}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Truck}
              title="No purchases yet"
              message="Record what you bought from a supplier; receiving it adds the stock."
              action={newPurchaseButton}
            />
          )
        }
      />
    );
  }

  return (
    <Page
      title="Purchases"
      description="Stock coming in from suppliers"
      primaryAction={newPurchaseButton}
      toolbar={
        <Toolbar
          search={
            <SearchInput
              label="Search purchases"
              placeholder="Supplier, invoice or P-number…"
              value={filters.search}
              onChange={(value) => update("search", value)}
            />
          }
          activeFilterCount={countActiveFilters(filters)}
          filters={
            <>
              <FilterSelect
                label="Status"
                value={filters.status}
                options={STATUS_OPTIONS}
                onChange={(value) => update("status", value as PurchaseFilters["status"])}
              />
              <FilterSelect
                label="Payment"
                value={filters.paymentStatus}
                options={PAYMENT_OPTIONS}
                onChange={(value) => update("paymentStatus", value as PurchaseFilters["paymentStatus"])}
              />
              <FilterSelect
                label="Supplier"
                value={filters.supplier}
                options={supplierOptions}
                onChange={(value) => update("supplier", value)}
              />
            </>
          }
        />
      }
    >
      {content}
      <NewPurchaseDialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          router.replace("/purchases");
        }}
        reorderProductName={reorderProductName}
      />
    </Page>
  );
}
