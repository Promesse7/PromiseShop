"use client";

import { useMemo, useState } from "react";
import { useCustomers } from "@/lib/customers/useCustomers";
import { CustomerTable } from "@/components/customers/CustomerTable";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { Button } from "@/components/ui/Button";
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
      <div className="text-sm text-red-400">
        Couldn&apos;t load customers.{" "}
        <button type="button" className="underline" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  if (customers.isLoading) {
    return <p className="text-sm text-text/50">Loading customers…</p>;
  }

  return (
    <div>
      <div className="flex gap-3 items-center mb-4 flex-wrap">
        <h4 className="m-0">Customers</h4>
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
      </div>
      <CustomerTable customers={filtered} onEdit={(customer) => setDialog({ mode: "edit", customer })} />
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
