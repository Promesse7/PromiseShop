"use client";

import { useMemo, useState } from "react";
import { Building2 } from "lucide-react";
import { useSuppliers } from "@/lib/suppliers/useSuppliers";
import { SupplierCardGrid } from "@/components/suppliers/SupplierCardGrid";
import { SupplierFormDialog } from "@/components/suppliers/SupplierFormDialog";
import { SearchInput } from "@/components/purchasing/ListControls";
import { Button } from "@/components/ui/Button";
import { Page, Toolbar } from "@/components/ui/Page";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Supplier } from "@/lib/types";

interface SuppliersPageClientProps {
  /** Admin and manager create and edit suppliers; staff only read them. */
  canEdit: boolean;
}

export default function SuppliersPageClient({ canEdit }: SuppliersPageClientProps) {
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

  const newSupplierButton = canEdit ? (
    <Button onClick={() => setDialog({ mode: "create" })}>+ New supplier</Button>
  ) : undefined;

  let content;
  if (suppliers.isError) {
    content = <ErrorState message="Couldn't load suppliers." onRetry={suppliers.refetch} />;
  } else if (suppliers.isLoading) {
    content = <LoadingState variant="cards" label="Loading suppliers…" />;
  } else {
    content = (
      <SupplierCardGrid
        suppliers={filtered}
        onEdit={canEdit ? (supplier) => setDialog({ mode: "edit", supplier }) : undefined}
        empty={
          search.trim() ? (
            <EmptyState
              icon={Building2}
              title="No suppliers match"
              message="Try another name, contact, phone or email."
              action={
                <Button variant="secondary" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Building2}
              title="No suppliers yet"
              message={
                canEdit
                  ? "Add the businesses you buy stock from, then pick them when recording a purchase."
                  : "An admin or manager adds suppliers."
              }
              action={newSupplierButton}
            />
          )
        }
      />
    );
  }

  return (
    <Page
      title="Suppliers"
      description="Who you buy stock from"
      primaryAction={newSupplierButton}
      toolbar={
        <Toolbar
          search={
            <SearchInput
              label="Search suppliers"
              placeholder="Name, contact, phone or email…"
              value={search}
              onChange={setSearch}
            />
          }
        />
      }
    >
      {content}
      <SupplierFormDialog
        open={dialog !== null}
        mode={dialog?.mode ?? "create"}
        initialSupplier={dialog?.supplier}
        onClose={() => setDialog(null)}
        onSaved={() => setDialog(null)}
      />
    </Page>
  );
}
