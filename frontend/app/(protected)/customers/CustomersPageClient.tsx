"use client";

import { useMemo, useState } from "react";
import { useCustomers } from "@/lib/customers/useCustomers";
import { CustomerCardGrid } from "@/components/customers/CustomerCardGrid";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import { CardGridSkeleton } from "@/components/ui/CardGridSkeleton";
import type { Customer } from "@/lib/types";

export default function CustomersPageClient() {
  const customers = useCustomers();
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; customer?: Customer } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers.all;
    return customers.all.filter(
      (c) => (c.name ?? "").toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q)
    );
  }, [customers.all, search]);

  if (customers.isError) {
    return (
      <ErrorState message="Couldn't load customers." />
    );
  }

  if (customers.isLoading) {
    return <CardGridSkeleton label="Loading customers…" />;
  }

  return (
    <div>
      <PageHeader title="Customers">
        <input
          aria-label="Search customers"
          placeholder="Search name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-[240px] min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md ml-4"
        />
        <Button onClick={() => setDialog({ mode: "create" })} className="ml-auto">
          + New customer
        </Button>
      </PageHeader>
      <CustomerCardGrid customers={filtered} onEdit={(customer) => setDialog({ mode: "edit", customer })} />
      <p className="text-xs text-text/50 mt-3">
        Walk-in sales need no customer record — the sale&apos;s customer is simply blank.
      </p>
      <CustomerFormDialog
        open={dialog !== null}
        mode={dialog?.mode ?? "create"}
        initialCustomer={dialog?.customer}
        onClose={() => setDialog(null)}
        onSaved={() => setDialog(null)}
      />
    </div>
  );
}
