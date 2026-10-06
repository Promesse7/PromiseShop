"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useCatalogProducts, type CatalogProduct } from "@/lib/products/useCatalogProducts";
import { ProductTable } from "@/components/products/ProductTable";
import { ProductCardGrid } from "@/components/products/ProductCardGrid";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { CategoryManagerDialog } from "@/components/products/CategoryManagerDialog";
import { DuplicatesDialog } from "@/components/products/DuplicatesDialog";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Button } from "@/components/ui/Button";
import { Page, Toolbar, type PageAction } from "@/components/ui/Page";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { LabelSheet } from "@/components/ui/LabelSheet";
import { ProductLabel } from "@/components/products/ProductLabel";
import { useToast } from "@/components/layout/ToastProvider";
import { apiFetch } from "@/lib/api-client";
import { DURATION, EASE, useReducedMotionSafe } from "@/lib/motion";
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

const INPUT_CLASS = "min-h-9 w-full rounded-md border border-divider bg-surface px-2.5 py-1.5 text-sm text-text";

interface ProductsPageClientProps {
  role: EmployeeRole;
}

export default function ProductsPageClient({ role }: ProductsPageClientProps) {
  const catalog = useCatalogProducts();
  const isAdmin = ADMIN_ROLES.includes(role);
  // Merging duplicates is admin only (it is irreversible).
  const isStrictAdmin = role === "admin";
  const reduced = useReducedMotionSafe();
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(false);
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
      const matchesActive = showInactive || p.is_active;
      const matchesCategory = categoryFilter === "all" || String(p.category_id) === categoryFilter;
      const matchesStock = stockFilter === "all" || p.status === stockFilter;
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.brand ?? "").toLowerCase().includes(q) ||
        (p.model_number ?? "").toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q);
      return matchesActive && matchesCategory && matchesStock && matchesSearch;
    });
    if (sortBy === "none") return matched;
    const sorted = [...matched];
    if (sortBy === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "price") sorted.sort((a, b) => a.retail_price - b.retail_price);
    else if (sortBy === "stock") sorted.sort((a, b) => a.quantity_in_stock - b.quantity_in_stock);
    return sorted;
  }, [catalog.all, search, categoryFilter, stockFilter, showInactive, sortBy]);

  const categoryOptions = [
    { value: "all", label: "All" },
    ...catalog.categories.map((c) => ({ value: String(c.category_id), label: c.name })),
  ];

  const activeFilterCount =
    (categoryFilter !== "all" ? 1 : 0) +
    (stockFilter !== "all" ? 1 : 0) +
    (showInactive ? 1 : 0) +
    (sortBy !== "none" ? 1 : 0);

  const secondaryActions: PageAction[] = isAdmin
    ? [
        { label: "Manage categories", onSelect: () => setCategoriesOpen(true) },
        ...(isStrictAdmin ? [{ label: "Find duplicates", onSelect: () => setDuplicatesOpen(true) }] : []),
      ]
    : [];

  const toolbar = (
    <Toolbar
      search={
        <input
          aria-label="Search products"
          placeholder="Search name, brand, model, barcode…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={INPUT_CLASS}
        />
      }
      activeFilterCount={activeFilterCount}
      filters={
        <>
          <SegmentedToggle name="category" options={categoryOptions} value={categoryFilter} onChange={setCategoryFilter} />
          <SegmentedToggle name="stock" options={STOCK_OPTIONS} value={stockFilter} onChange={setStockFilter} />
          <select
            aria-label="Sort by"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="min-h-9 rounded-md border border-divider bg-surface px-2.5 py-1.5 text-sm text-text"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-text/70">
            <input
              type="checkbox"
              aria-label="Show inactive"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>
        </>
      }
      trailing={
        <SegmentedToggle name="view" options={VIEW_OPTIONS} value={view} onChange={(v) => setView(v as "grid" | "table")} />
      }
    />
  );

  let content;
  if (catalog.isError) {
    content = <ErrorState message="Couldn't load products." onRetry={catalog.refetch} />;
  } else if (catalog.isLoading) {
    content = <LoadingState variant={view === "grid" ? "cards" : "table"} label="Loading products…" />;
  } else if (view === "grid") {
    content = (
      <ProductCardGrid
        products={filtered}
        showWholesale={isAdmin}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onPrintLabel={(product) => setPrintQueue([product])}
      />
    );
  } else {
    content = <ProductTable products={filtered} showWholesale={isAdmin} />;
  }

  const bulkBar =
    selectedIds.size > 0 ? (
      <motion.div
        key="bulk"
        role="region"
        aria-label="Selected products"
        className="fixed inset-x-3 bottom-24 z-20 flex items-center gap-2 rounded-lg border border-accent/20 bg-surface p-2 text-sm shadow-lg lg:static lg:inset-auto lg:z-auto lg:bg-accent/10 lg:shadow-none"
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE.out } }}
        exit={reduced ? undefined : { opacity: 0, y: 12, transition: { duration: DURATION.fast } }}
      >
        <span className="pl-1">{selectedIds.size} selected</span>
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          {isAdmin && (
            <Button variant="secondary" onClick={handleBulkDeactivate} disabled={deactivating}>
              {deactivating ? "Deactivating…" : `Deactivate ${selectedIds.size} products`}
            </Button>
          )}
          <Button variant="secondary" onClick={() => setPrintQueue(filtered.filter((p) => selectedIds.has(p.product_id)))}>
            Print {selectedIds.size} labels
          </Button>
        </div>
      </motion.div>
    ) : null;

  return (
    <Page
      title="Products"
      description="Everything the shop sells, with price and stock at a glance"
      primaryAction={isAdmin ? <Button onClick={() => setCreateOpen(true)}>+ New product</Button> : undefined}
      secondaryActions={secondaryActions}
      toolbar={toolbar}
    >
      <div className="flex flex-col gap-3">
        {reduced ? bulkBar : <AnimatePresence>{bulkBar}</AnimatePresence>}
        {content}
      </div>
      <ProductFormDialog
        open={createOpen}
        mode="create"
        categories={catalog.categories}
        existingProducts={catalog.all}
        onClose={() => setCreateOpen(false)}
        onSaved={() => setCreateOpen(false)}
      />
      {isStrictAdmin && <DuplicatesDialog open={duplicatesOpen} onClose={() => setDuplicatesOpen(false)} />}
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
    </Page>
  );
}
