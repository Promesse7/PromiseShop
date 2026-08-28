"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCatalogProducts, type CatalogProduct } from "@/lib/products/useCatalogProducts";
import { ProductTable } from "@/components/products/ProductTable";
import { ProductCardGrid } from "@/components/products/ProductCardGrid";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { CategoryManagerDialog } from "@/components/products/CategoryManagerDialog";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import { CardGridSkeleton } from "@/components/ui/CardGridSkeleton";
import { LabelSheet } from "@/components/ui/LabelSheet";
import { ProductLabel } from "@/components/products/ProductLabel";
import { useToast } from "@/components/layout/ToastProvider";
import { apiFetch } from "@/lib/api-client";
import type { EmployeeRole } from "@/lib/types";

const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];

const VIEW_OPTIONS = [
  { value: "grid", label: "Grid" },
  { value: "table", label: "List" },
];

const STOCK_OPTIONS = [
  { value: "all", label: "All" },
  { value: "ok", label: "In stock" },
  { value: "low_stock", label: "Low stock" },
  { value: "out_of_stock", label: "Out of stock" },
];

const SORT_OPTIONS = [
  { value: "none", label: "Default" },
  { value: "name", label: "Name (A–Z)" },
  { value: "price", label: "Price (low–high)" },
  { value: "stock", label: "Stock (low–high)" },
];
type SortOption = (typeof SORT_OPTIONS)[number]["value"];

interface ProductsPageClientProps {
  role: EmployeeRole;
}

export default function ProductsPageClient({ role }: ProductsPageClientProps) {
  const catalog = useCatalogProducts();
  const isAdmin = ADMIN_ROLES.includes(role);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortOption>("none");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [createOpen, setCreateOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [printQueue, setPrintQueue] = useState<CatalogProduct[] | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const queryClient = useQueryClient();
  const { show } = useToast();

  useEffect(() => {
    if (!printQueue) return;
    // window.print() blocks until the print dialog closes, firing "afterprint" before
    // returning — the listener must be registered before calling it, not after.
    const handleAfterPrint = () => setPrintQueue(null);
    window.addEventListener("afterprint", handleAfterPrint);
    window.print();
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, [printQueue]);

  function toggleSelect(productId: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  async function handleBulkDeactivate() {
    const ids = Array.from(selectedIds);
    setDeactivating(true);
    let succeeded = 0;
    for (const id of ids) {
      try {
        await apiFetch(`products/${id}/set-active/`, {
          method: "POST",
          body: JSON.stringify({ is_active: false }),
        });
        succeeded += 1;
      } catch {
        // continue attempting the rest; failures are reflected in the summary toast below.
      }
    }
    queryClient.invalidateQueries({ queryKey: ["products"] });
    setSelectedIds(new Set());
    setDeactivating(false);
    show(
      succeeded === ids.length
        ? `${succeeded} products deactivated.`
        : `${succeeded} of ${ids.length} products deactivated.`,
      succeeded === ids.length ? "success" : "error"
    );
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = catalog.all.filter((p) => {
      const matchesCategory = categoryFilter === "all" || String(p.category_id) === categoryFilter;
      const matchesStock = stockFilter === "all" || p.status === stockFilter;
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.brand ?? "").toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q);
      return matchesCategory && matchesStock && matchesSearch;
    });
    if (sortBy === "none") return matched;
    const sorted = [...matched];
    if (sortBy === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "price") sorted.sort((a, b) => a.retail_price - b.retail_price);
    else if (sortBy === "stock") sorted.sort((a, b) => a.quantity_in_stock - b.quantity_in_stock);
    return sorted;
  }, [catalog.all, search, categoryFilter, stockFilter, sortBy]);

  const categoryOptions = [
    { value: "all", label: "All" },
    ...catalog.categories.map((c) => ({ value: String(c.category_id), label: c.name })),
  ];

  if (catalog.isError) {
    return (
      <ErrorState message="Couldn't load products." />
    );
  }

  if (catalog.isLoading) {
    return <CardGridSkeleton label="Loading products…" />;
  }

  return (
    <div>
      <PageHeader title="Products">
        <input
          aria-label="Search products"
          placeholder="Search name, brand, barcode…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-[300px] min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md ml-4"
        />
        <SegmentedToggle name="category" options={categoryOptions} value={categoryFilter} onChange={setCategoryFilter} />
        <SegmentedToggle name="stock" options={STOCK_OPTIONS} value={stockFilter} onChange={setStockFilter} />
        <select
          aria-label="Sort by"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <SegmentedToggle name="view" options={VIEW_OPTIONS} value={view} onChange={(v) => setView(v as "grid" | "table")} />
        {isAdmin && (
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={() => setCategoriesOpen(true)}>
              Manage categories
            </Button>
            <Button onClick={() => setCreateOpen(true)}>+ New product</Button>
          </div>
        )}
      </PageHeader>
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2 rounded-md bg-accent/10 text-sm">
          <span>{selectedIds.size} selected</span>
          <div className="ml-auto flex gap-2">
            {isAdmin && (
              <Button variant="secondary" onClick={handleBulkDeactivate} disabled={deactivating}>
                {deactivating ? "Deactivating…" : `Deactivate ${selectedIds.size} products`}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => setPrintQueue(filtered.filter((p) => selectedIds.has(p.product_id)))}
            >
              Print {selectedIds.size} labels
            </Button>
          </div>
        </div>
      )}
      {view === "grid" ? (
        <ProductCardGrid
          products={filtered}
          showWholesale={isAdmin}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onPrintLabel={(product) => setPrintQueue([product])}
        />
      ) : (
        <ProductTable products={filtered} showWholesale={isAdmin} />
      )}
      <ProductFormDialog
        open={createOpen}
        mode="create"
        categories={catalog.categories}
        onClose={() => setCreateOpen(false)}
        onSaved={() => setCreateOpen(false)}
      />
      <CategoryManagerDialog
        open={categoriesOpen}
        categories={catalog.categories}
        onClose={() => setCategoriesOpen(false)}
      />
      {printQueue && (
        <LabelSheet>
          {printQueue.map((p) => (
            <ProductLabel key={p.product_id} product={p} />
          ))}
        </LabelSheet>
      )}
    </div>
  );
}
