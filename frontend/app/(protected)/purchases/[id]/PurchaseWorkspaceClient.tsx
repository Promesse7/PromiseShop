"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScanLine } from "lucide-react";
import { usePurchaseDetail } from "@/lib/purchasing/usePurchaseDetail";
import { useSuppliers } from "@/lib/suppliers/useSuppliers";
import { useReceivePurchase } from "@/lib/purchasing/useReceivePurchase";
import { useCancelPurchase } from "@/lib/purchasing/useCancelPurchase";
import { totalUnits } from "@/lib/purchasing/lineKinds";
import { AddProductSingleForm } from "@/components/purchasing/AddProductSingleForm";
import { AddProductBulkTable } from "@/components/purchasing/AddProductBulkTable";
import { AddPackForm } from "@/components/purchasing/AddPackForm";
import { AddBundleForm } from "@/components/purchasing/AddBundleForm";
import { ReceivedLabelsDialog } from "@/components/purchasing/ReceivedLabelsDialog";
import { PurchaseItemsList } from "@/components/purchasing/PurchaseItemsList";
import { PurchaseSummaryCard } from "@/components/purchasing/PurchaseSummaryCard";
import { SupplierPaymentCard } from "@/components/purchasing/SupplierPaymentCard";
import { PurchaseSteps } from "@/components/purchasing/PurchaseSteps";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Button } from "@/components/ui/Button";
import { Card, CardKicker } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Page } from "@/components/ui/Page";
import { Tag } from "@/components/ui/Tag";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/layout/ToastProvider";
import { useIsDesktop } from "@/lib/useMediaQuery";
import { formatRwf } from "@/lib/format";
import { ApiError, extractErrorMessage } from "@/lib/api-client";
import type { EmployeeRole, Purchase, PurchaseItem } from "@/lib/types";

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

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export default function PurchaseWorkspaceClient({ purchaseId, role }: PurchaseWorkspaceClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefill = searchParams.get("prefill") ?? undefined;
  const { show } = useToast();
  const confirm = useConfirm();
  const isDesktop = useIsDesktop();
  const { purchase, isLoading, isError, refetch } = usePurchaseDetail(purchaseId);
  const suppliers = useSuppliers();
  const receivePurchase = useReceivePurchase();
  const cancelPurchase = useCancelPurchase();
  const [addMode, setAddMode] = useState<AddMode>("single");
  const [detailsOpen, setDetailsOpen] = useState(false);
  // The lines just received, for the "print labels / scan serials" dialog.
  const [received, setReceived] = useState<PurchaseItem[] | null>(null);
  const isAdmin = ADMIN_ROLES.includes(role);

  if (isError) {
    return <ErrorState message="Couldn't load this purchase." onRetry={refetch} />;
  }

  if (isLoading || !purchase) {
    return <LoadingState variant="detail" label="Loading purchase…" />;
  }

  const supplierName =
    suppliers.all.find((s) => s.supplier_id === purchase.supplier)?.name ?? `Supplier #${purchase.supplier}`;
  const isDraft = purchase.status === "draft";
  const isCancelled = purchase.status === "cancelled";
  const statusTag = STATUS_TAG[purchase.status];
  const itemCount = purchase.items.length;
  const canReceive = isDraft && itemCount > 0 && !receivePurchase.isPending;

  async function handleReceive() {
    const ok = await confirm({
      title: "Receive this purchase?",
      message: "Stock will increase and this can't be undone.",
      confirmLabel: "Receive",
    });
    if (!ok) return;
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
    setDetailsOpen(false);
    const ok = await confirm({
      title: "Cancel this purchase?",
      message: isDraft
        ? "The draft and its lines are cancelled. This can't be undone."
        : "Stock it brought in will be reversed, and this can't be undone.",
      confirmLabel: "Cancel purchase",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await cancelPurchase.mutateAsync(purchaseId);
      show("Purchase cancelled.", "success");
    } catch (error) {
      const message =
        error instanceof ApiError ? extractErrorMessage(error.body) : "Something went wrong — try again.";
      show(message, "error");
    }
  }

  // Totals, supplier payments and the secondary actions: a sticky side column on desktop,
  // a Details sheet on phone (Receive itself lives in the phone's sticky bar).
  const summaryPanel = (
    <div className="flex flex-col gap-3">
      <PurchaseSummaryCard purchase={purchase} />
      {isAdmin && <SupplierPaymentCard purchase={purchase} />}
      {isDraft && isDesktop && (
        <>
          <Button onClick={handleReceive} disabled={!canReceive} block>
            {receivePurchase.isPending ? "Receiving…" : "Receive purchase → stock increases"}
          </Button>
          {itemCount === 0 && <p className="-mt-2 text-xs text-text/50">Add at least one item before receiving.</p>}
        </>
      )}
      {isDraft && (
        <Button variant="secondary" onClick={() => router.push("/purchases")} block>
          Save draft
        </Button>
      )}
      {isAdmin && !isCancelled && (
        <Button variant="secondary" onClick={handleCancel} disabled={cancelPurchase.isPending} block>
          {cancelPurchase.isPending ? "Cancelling…" : "Cancel purchase"}
        </Button>
      )}
    </div>
  );

  return (
    <Page
      title={supplierName}
      description={`#P-${purchase.purchase_id} · ${purchase.invoice_number ?? "no invoice #"} · ${purchase.purchase_date}`}
      breadcrumb={[{ label: "Buy" }, { label: "Purchases", href: "/purchases" }, { label: `#P-${purchase.purchase_id}` }]}
      back="/purchases"
      primaryAction={
        isDraft ? (
          <Button href={`/purchases/${purchaseId}/scan`} variant="secondary">
            Scan to add →
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 pb-28 lg:pb-0">
        <div className="flex flex-wrap items-center gap-2">
          <Tag variant={statusTag.variant}>{statusTag.label}</Tag>
          <VatInvoiceTag purchase={purchase} />
        </div>

        <PurchaseSteps itemCount={itemCount} status={purchase.status} />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-6">
            {isDraft && (
              <Card elevation="sm">
                <div className="flex flex-wrap items-center gap-3">
                  <CardKicker>Add product</CardKicker>
                  <SegmentedToggle
                    name="add-mode"
                    options={ADD_MODE_OPTIONS}
                    value={addMode}
                    onChange={(v) => setAddMode(v as AddMode)}
                  />
                  <ScanLine className="ml-auto hidden h-4 w-4 text-text/40 sm:block" aria-hidden />
                </div>
                <div>
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
              </Card>
            )}

            <section aria-label="On this purchase" className="flex flex-col gap-2">
              <h2 className="m-0 text-xs uppercase tracking-wide text-accent">On this purchase</h2>
              <PurchaseItemsList purchaseId={purchaseId} items={purchase.items} editable={isDraft} showCosts={isAdmin} />
            </section>
          </div>

          {isDesktop && <aside className="flex flex-col gap-3 self-start lg:sticky lg:top-20">{summaryPanel}</aside>}
        </div>
      </div>

      {!isDesktop && (
        <>
          <section
            aria-label="Purchase summary"
            className="fixed inset-x-3 z-20 flex items-center gap-2 rounded-lg border border-divider bg-surface/95 px-3 py-2 shadow-lg backdrop-blur print:hidden"
            style={{ bottom: "calc(80px + env(safe-area-inset-bottom))" }}
          >
            <div className="min-w-0 flex-1 text-sm">
              <span className="font-medium">{plural(itemCount, "item")}</span>
              <span className="text-text/60">
                {" · "}
                {purchase.total_paid != null ? formatRwf(purchase.total_paid) : plural(totalUnits(purchase.items), "unit")}
              </span>
            </div>
            <Button variant="secondary" onClick={() => setDetailsOpen(true)}>
              Details
            </Button>
            {isDraft && (
              <Button onClick={handleReceive} disabled={!canReceive}>
                {receivePurchase.isPending ? "Receiving…" : "Receive →"}
              </Button>
            )}
          </section>
          <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Purchase details">
            {summaryPanel}
          </Dialog>
        </>
      )}

      <ReceivedLabelsDialog open={received !== null} onClose={() => setReceived(null)} items={received ?? []} />
    </Page>
  );
}

function VatInvoiceTag({ purchase }: { purchase: Purchase }) {
  if (purchase.has_vat_invoice === undefined) return null;
  return purchase.has_vat_invoice ? (
    <Tag variant="outline">VAT invoice</Tag>
  ) : (
    <Tag variant="warning">No VAT invoice</Tag>
  );
}
