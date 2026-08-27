"use client";

import { useMemo, useState } from "react";
import { useSuppliers } from "@/lib/suppliers/useSuppliers";
import { SupplierCardGrid } from "@/components/suppliers/SupplierCardGrid";
import { SupplierFormDialog } from "@/components/suppliers/SupplierFormDialog";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import { CardGridSkeleton } from "@/components/ui/CardGridSkeleton";
import type { Supplier } from "@/lib/types";

export default function SuppliersPageClient() {
  const suppliers = useSuppliers();
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; supplier?: Supplier } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers.all;
    return suppliers.all.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.contact_person ?? "").toLowerCase().includes(q) ||
        (s.phone ?? "").toLowerCase().includes(q) ||
        (s.email ?? "").toLowerCase().includes(q)
    );
  }, [suppliers.all, search]);

  if (suppliers.isError) {
    return (
      <ErrorState message="Couldn't load suppliers." />
    );
  }

  if (suppliers.isLoading) {
    return <CardGridSkeleton label="Loading suppliers…" />;
  }

  return (
    <div>
      <PageHeader title="Suppliers">
        <input
          aria-label="Search suppliers"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-[220px] min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md ml-4"
        />
        <Button onClick={() => setDialog({ mode: "create" })} className="ml-auto">
          + New supplier
        </Button>
      </PageHeader>
      <SupplierCardGrid suppliers={filtered} onEdit={(supplier) => setDialog({ mode: "edit", supplier })} />
      <SupplierFormDialog
        open={dialog !== null}
        mode={dialog?.mode ?? "create"}
        initialSupplier={dialog?.supplier}
        onClose={() => setDialog(null)}
        onSaved={() => setDialog(null)}
      />
    </div>
  );
}
