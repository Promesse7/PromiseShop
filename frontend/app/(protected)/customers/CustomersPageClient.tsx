"use client";

import { useMemo, useState } from "react";
import { useCustomers } from "@/lib/customers/useCustomers";
import { CustomerCardGrid } from "@/components/customers/CustomerCardGrid";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Page, Toolbar } from "@/components/ui/Page";
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

  return (
    <Page
      title="Customers"
      description="Walk-in sales need no customer record — the sale's customer is simply blank."
      primaryAction={<Button onClick={() => setDialog({ mode: "create" })}>+ New customer</Button>}
      toolbar={
        <Toolbar
          search={
            <input
              type="search"
              aria-label="Search customers"
              placeholder="Search name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full min-h-9 rounded-md border border-divider bg-surface px-2.5 py-1.5 text-sm text-text lg:max-w-[280px]"
            />
          }
        />
      }
    >
      {customers.isError ? (
        <ErrorState message="Couldn't load customers." onRetry={() => customers.refetch()} />
      ) : customers.isLoading ? (
        <LoadingState variant="cards" label="Loading customers…" />
      ) : (
        <CustomerCardGrid customers={filtered} onEdit={(customer) => setDialog({ mode: "edit", customer })} />
      )}
      <CustomerFormDialog
        open={dialog !== null}
        mode={dialog?.mode ?? "create"}
        initialCustomer={dialog?.customer}
        onClose={() => setDialog(null)}
        onSaved={() => setDialog(null)}
      />
    </Page>
  );
}
