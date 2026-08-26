"use client";

import { useMemo, useState } from "react";
import { useCatalogProducts } from "@/lib/products/useCatalogProducts";
import { ProductTable } from "@/components/products/ProductTable";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import type { EmployeeRole } from "@/lib/types";

const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];

interface ProductsPageClientProps {
  role: EmployeeRole;
}

export default function ProductsPageClient({ role }: ProductsPageClientProps) {
  const catalog = useCatalogProducts();
  const isAdmin = ADMIN_ROLES.includes(role);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);

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
      <div className="text-sm text-red-400">
        Couldn&apos;t load products.{" "}
        <button type="button" className="underline" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  if (catalog.isLoading) {
    return <p className="text-sm text-text/50">Loading products…</p>;
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
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)} className="ml-auto">
            + New product
          </Button>
        )}
      </PageHeader>
      <ProductTable products={filtered} showWholesale={isAdmin} />
      <ProductFormDialog
        open={createOpen}
        mode="create"
        categories={catalog.categories}
        onClose={() => setCreateOpen(false)}
        onSaved={() => setCreateOpen(false)}
      />
    </div>
  );
}
