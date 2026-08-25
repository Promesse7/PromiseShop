"use client";

import { useState } from "react";
import { usePurchases } from "@/lib/purchasing/usePurchases";
import { PurchaseTable } from "@/components/purchasing/PurchaseTable";
import { NewPurchaseDialog } from "@/components/purchasing/NewPurchaseDialog";
import { Button } from "@/components/ui/Button";
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
      <div className="flex gap-3 items-center mb-4 flex-wrap">
        <h4 className="m-0">Purchases</h4>
        <Button onClick={() => setCreateOpen(true)} className="ml-auto">
          + New purchase
        </Button>
      </div>
      <PurchaseTable rows={purchases.rows} showTotals={isAdmin} />
      <NewPurchaseDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
