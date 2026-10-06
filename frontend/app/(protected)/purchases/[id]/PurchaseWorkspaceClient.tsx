"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { usePurchaseDetail } from "@/lib/purchasing/usePurchaseDetail";
import { useSuppliers } from "@/lib/suppliers/useSuppliers";
import { useReceivePurchase } from "@/lib/purchasing/useReceivePurchase";
import { useCancelPurchase } from "@/lib/purchasing/useCancelPurchase";
import { AddProductSingleForm } from "@/components/purchasing/AddProductSingleForm";
import { AddProductBulkTable } from "@/components/purchasing/AddProductBulkTable";
import { AddPackForm } from "@/components/purchasing/AddPackForm";
import { AddBundleForm } from "@/components/purchasing/AddBundleForm";
import { ReceivedLabelsDialog } from "@/components/purchasing/ReceivedLabelsDialog";
import { PurchaseItemsList } from "@/components/purchasing/PurchaseItemsList";
import { PurchaseSummaryCard } from "@/components/purchasing/PurchaseSummaryCard";
import { PurchaseSteps } from "@/components/purchasing/PurchaseSteps";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { ErrorState } from "@/components/ui/ErrorState";
import { useToast } from "@/components/layout/ToastProvider";
import { ApiError, extractErrorMessage } from "@/lib/api-client";
import type { EmployeeRole, PurchaseItem } from "@/lib/types";

// Single and Bulk add single-unit lines; Pack and Bundle are the Module F line kinds.
const ADD_MODE_OPTIONS = [
  { value: "single", label: "Single" },
  { value: "bulk", label: "Bulk" },
  { value: "pack", label: "Pack" },
  { value: "bundle", label: "Bundle" },
];

type AddMode = "single" | "bulk" | "pack" | "bundle";

const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];

const STATUS_TAG = {
  draft: { label: "Draft", variant: "outline" as const },
  received: { label: "Received", variant: "accent" as const },
  cancelled: { label: "Cancelled", variant: "neutral" as const },
};

interface PurchaseWorkspaceClientProps {
  purchaseId: number;
  role: EmployeeRole;
}

export default function PurchaseWorkspaceClient({ purchaseId, role }: PurchaseWorkspaceClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefill = searchParams.get("prefill") ?? undefined;
  const { show } = useToast();
  const { purchase, isLoading, isError } = usePurchaseDetail(purchaseId);
  const suppliers = useSuppliers();
  const receivePurchase = useReceivePurchase();
  const cancelPurchase = useCancelPurchase();
  const [addMode, setAddMode] = useState<AddMode>("single");
  // The lines just received, for the "print labels / scan serials" dialog.
  const [received, setReceived] = useState<PurchaseItem[] | null>(null);
  const isAdmin = ADMIN_ROLES.includes(role);

  if (isError) {
    return (
      <ErrorState message="Couldn't load this purchase." />
    );
  }

  if (isLoading || !purchase) {
    return <p className="text-sm text-text/50">Loading purchase…</p>;
  }

  const supplierName = suppliers.all.find((s) => s.supplier_id === purchase.supplier)?.name ?? `Supplier #${purchase.supplier}`;
  const isDraft = purchase.status === "draft";
  const isCancelled = purchase.status === "cancelled";
  const statusTag = STATUS_TAG[purchase.status];

  async function handleReceive() {
    if (!window.confirm("Receive this purchase? Stock will increase and this can't be undone.")) return;
    try {
      await receivePurchase.mutateAsync(purchaseId);
      show("Purchase received — stock updated.", "success");
      setReceived(purchase?.items ?? []);
    } catch (error) {
      const message =
        error instanceof ApiError ? extractErrorMessage(error.body) : "Something went wrong — try again.";
      show(message, "error");
    }
  }

  async function handleCancel() {
    const warning = isDraft
      ? "Cancel this draft purchase? This can't be undone."
      : "Cancel this purchase? Stock it brought in will be reversed, and this can't be undone.";
    if (!window.confirm(warning)) return;
    try {
      await cancelPurchase.mutateAsync(purchaseId);
      show("Purchase cancelled.", "success");
    } catch (error) {
      const message =
        error instanceof ApiError ? extractErrorMessage(error.body) : "Something went wrong — try again.";
      show(message, "error");
    }
  }

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-4">
        <h4 className="m-0">{supplierName}</h4>
        <span className="text-sm text-text/50">
          #P-{purchase.purchase_id} · {purchase.invoice_number ?? "no invoice #"} · {purchase.purchase_date}
        </span>
        <Tag variant={statusTag.variant}>{statusTag.label}</Tag>
      </div>

      <PurchaseSteps itemCount={purchase.items.length} status={purchase.status} />

      {isDraft && (
        <>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs uppercase tracking-wide text-accent">Add product</span>
            <SegmentedToggle name="add-mode" options={ADD_MODE_OPTIONS} value={addMode} onChange={(v) => setAddMode(v as AddMode)} />
            <Link href={`/purchases/${purchaseId}/scan`} className="text-sm ml-auto">
              Scan to add →
            </Link>
          </div>
          <div className="mb-6">
            {addMode === "single" && (
              <AddProductSingleForm purchaseId={purchaseId} onAdded={() => {}} initialSearch={prefill} />
            )}
            {addMode === "bulk" && (
              <AddProductBulkTable purchaseId={purchaseId} supplierId={purchase.supplier} onAdded={() => {}} />
            )}
            {addMode === "pack" && <AddPackForm purchaseId={purchaseId} onAdded={() => {}} />}
            {addMode === "bundle" && (
              <AddBundleForm purchaseId={purchaseId} supplierId={purchase.supplier} onAdded={() => {}} />
            )}
          </div>
        </>
      )}

      <div className="grid grid-cols-[1fr_320px] gap-6">
        <div>
          <span className="text-xs uppercase tracking-wide text-accent">On this purchase</span>
          <PurchaseItemsList purchaseId={purchaseId} items={purchase.items} editable={isDraft} showCosts={isAdmin} />
        </div>
        <div className="flex flex-col gap-3">
          <PurchaseSummaryCard purchase={purchase} />
          {isDraft && (
            <>
              <Button onClick={handleReceive} disabled={purchase.items.length === 0 || receivePurchase.isPending} block>
                {receivePurchase.isPending ? "Receiving…" : "Receive purchase → stock increases"}
              </Button>
              {purchase.items.length === 0 && (
                <p className="text-xs text-text/50 -mt-2">Add at least one item before receiving.</p>
              )}
              <Button variant="secondary" onClick={() => router.push("/purchases")} block>
                Save draft
              </Button>
            </>
          )}
          {isAdmin && !isCancelled && (
            <Button variant="secondary" onClick={handleCancel} disabled={cancelPurchase.isPending} block>
              {cancelPurchase.isPending ? "Cancelling…" : "Cancel purchase"}
            </Button>
          )}
        </div>
      </div>
      <ReceivedLabelsDialog open={received !== null} onClose={() => setReceived(null)} items={received ?? []} />
    </div>
  );
}
