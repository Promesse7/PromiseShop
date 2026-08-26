"use client";

import { useState } from "react";
import { usePurchases } from "@/lib/purchasing/usePurchases";
import { PurchaseTable } from "@/components/purchasing/PurchaseTable";
import { NewPurchaseDialog } from "@/components/purchasing/NewPurchaseDialog";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import type { EmployeeRole } from "@/lib/types";

const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];

interface PurchasesPageClientProps {
  role: EmployeeRole;
}

export default function PurchasesPageClient({ role }: PurchasesPageClientProps) {
  const purchases = usePurchases();
  const isAdmin = ADMIN_ROLES.includes(role);
  const [createOpen, setCreateOpen] = useState(false);

  if (purchases.isError) {
    return (
      <div className="text-sm text-red-400">
        Couldn&apos;t load purchases.{" "}
        <button type="button" className="underline" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  if (purchases.isLoading) {
    return <p className="text-sm text-text/50">Loading purchases…</p>;
  }

  return (
    <div>
      <PageHeader title="Purchases">
        <Button onClick={() => setCreateOpen(true)} className="ml-auto">
          + New purchase
        </Button>
      </PageHeader>
      <PurchaseTable rows={purchases.rows} showTotals={isAdmin} />
      <NewPurchaseDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
