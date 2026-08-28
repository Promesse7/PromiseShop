"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePurchases } from "@/lib/purchasing/usePurchases";
import { PurchaseTable } from "@/components/purchasing/PurchaseTable";
import { NewPurchaseDialog } from "@/components/purchasing/NewPurchaseDialog";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import type { EmployeeRole } from "@/lib/types";

const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];

interface PurchasesPageClientProps {
  role: EmployeeRole;
}

export default function PurchasesPageClient({ role }: PurchasesPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const purchases = usePurchases();
  const isAdmin = ADMIN_ROLES.includes(role);
  const [createOpen, setCreateOpen] = useState(searchParams.get("open") === "new");
  const reorderProductName = searchParams.get("reorder_name") ?? undefined;

  if (purchases.isError) {
    return (
      <ErrorState message="Couldn't load purchases." />
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
      <NewPurchaseDialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          router.replace("/purchases");
        }}
        reorderProductName={reorderProductName}
      />
    </div>
  );
}
