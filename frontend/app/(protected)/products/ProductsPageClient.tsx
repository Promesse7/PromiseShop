"use client";

import { useEffect, useMemo, useState } from "react";
import { useCatalogProducts, type CatalogProduct } from "@/lib/products/useCatalogProducts";
import { ProductTable } from "@/components/products/ProductTable";
import { ProductCardGrid } from "@/components/products/ProductCardGrid";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import { CardGridSkeleton } from "@/components/ui/CardGridSkeleton";
import { LabelSheet } from "@/components/ui/LabelSheet";
import { ProductLabel } from "@/components/products/ProductLabel";
import type { EmployeeRole } from "@/lib/types";

const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];

const VIEW_OPTIONS = [
  { value: "grid", label: "Grid" },
  { value: "table", label: "List" },
];

interface ProductsPageClientProps {
  role: EmployeeRole;
}

export default function ProductsPageClient({ role }: ProductsPageClientProps) {
  const catalog = useCatalogProducts();
  const isAdmin = ADMIN_ROLES.includes(role);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [printQueue, setPrintQueue] = useState<CatalogProduct[] | null>(null);

  useEffect(() => {
    if (!printQueue) return;
    window.print();
    const handleAfterPrint = () => setPrintQueue(null);
    window.addEventListener("afterprint", handleAfterPrint);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.all.filter((p) => {
      const matchesCategory = categoryFilter === "all" || String(p.category_id) === categoryFilter;
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.brand ?? "").toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [catalog.all, search, categoryFilter]);

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
        <SegmentedToggle name="view" options={VIEW_OPTIONS} value={view} onChange={(v) => setView(v as "grid" | "table")} />
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)} className="ml-auto">
            + New product
          </Button>
        )}
      </PageHeader>
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2 rounded-md bg-accent/10 text-sm">
          <span>{selectedIds.size} selected</span>
          <Button
            variant="secondary"
            className="ml-auto"
            onClick={() => setPrintQueue(filtered.filter((p) => selectedIds.has(p.product_id)))}
          >
            Print {selectedIds.size} labels
          </Button>
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
