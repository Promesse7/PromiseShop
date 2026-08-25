"use client";

import { useMemo, useState } from "react";
import { useSuppliers } from "@/lib/suppliers/useSuppliers";
import { SupplierTable } from "@/components/suppliers/SupplierTable";
import { SupplierFormDialog } from "@/components/suppliers/SupplierFormDialog";
import { Button } from "@/components/ui/Button";
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
      <div className="text-sm text-red-400">
        Couldn&apos;t load suppliers.{" "}
        <button type="button" className="underline" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  if (suppliers.isLoading) {
    return <p className="text-sm text-text/50">Loading suppliers…</p>;
  }

  return (
    <div>
      <div className="flex gap-3 items-center mb-4 flex-wrap">
        <h4 className="m-0">Suppliers</h4>
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
      </div>
      <SupplierTable suppliers={filtered} onEdit={(supplier) => setDialog({ mode: "edit", supplier })} />
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
