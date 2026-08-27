"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePurchaseDetail } from "@/lib/purchasing/usePurchaseDetail";
import { useSuppliers } from "@/lib/suppliers/useSuppliers";
import { useReceivePurchase } from "@/lib/purchasing/useReceivePurchase";
import { AddProductSingleForm } from "@/components/purchasing/AddProductSingleForm";
import { AddProductBulkTable } from "@/components/purchasing/AddProductBulkTable";
import { PurchaseItemsList } from "@/components/purchasing/PurchaseItemsList";
import { PurchaseSummaryCard } from "@/components/purchasing/PurchaseSummaryCard";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { ErrorState } from "@/components/ui/ErrorState";
import { useToast } from "@/components/layout/ToastProvider";
import { ApiError, extractErrorMessage } from "@/lib/api-client";

const ADD_MODE_OPTIONS = [
  { value: "single", label: "Single" },
  { value: "bulk", label: "Bulk" },
];

interface PurchaseWorkspaceClientProps {
  purchaseId: number;
}

export default function PurchaseWorkspaceClient({ purchaseId }: PurchaseWorkspaceClientProps) {
  const router = useRouter();
  const { show } = useToast();
  const { purchase, isLoading, isError } = usePurchaseDetail(purchaseId);
  const suppliers = useSuppliers();
  const receivePurchase = useReceivePurchase();
  const [addMode, setAddMode] = useState<"single" | "bulk">("single");

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

  async function handleReceive() {
    if (!window.confirm("Receive this purchase? Stock will increase and this can't be undone.")) return;
    try {
      await receivePurchase.mutateAsync(purchaseId);
      show("Purchase received — stock updated.", "success");
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
        <Tag variant={isDraft ? "outline" : "accent"}>{isDraft ? "Draft" : "Received"}</Tag>
      </div>

      {isDraft && (
        <>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs uppercase tracking-wide text-accent">Add product</span>
            <SegmentedToggle name="add-mode" options={ADD_MODE_OPTIONS} value={addMode} onChange={(v) => setAddMode(v as "single" | "bulk")} />
          </div>
          <div className="mb-6">
            {addMode === "single" ? (
              <AddProductSingleForm purchaseId={purchaseId} onAdded={() => {}} />
            ) : (
              <AddProductBulkTable purchaseId={purchaseId} onAdded={() => {}} />
            )}
          </div>
        </>
      )}

      <div className="grid grid-cols-[1fr_320px] gap-6">
        <div>
          <span className="text-xs uppercase tracking-wide text-accent">On this purchase</span>
          <PurchaseItemsList purchaseId={purchaseId} items={purchase.items} editable={isDraft} />
        </div>
        <div className="flex flex-col gap-3">
          <PurchaseSummaryCard purchase={purchase} />
          {isDraft && (
            <>
              <Button onClick={handleReceive} disabled={purchase.items.length === 0 || receivePurchase.isPending} block>
                {receivePurchase.isPending ? "Receiving…" : "Receive purchase → stock increases"}
              </Button>
              <Button variant="secondary" onClick={() => router.push("/purchases")} block>
                Save draft
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
