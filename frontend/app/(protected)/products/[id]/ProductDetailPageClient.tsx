"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useProductDetail } from "@/lib/products/useProductDetail";
import { useProductProfitability } from "@/lib/products/useProductProfitability";
import { buildReorderUrl } from "@/lib/purchasing/reorderUrl";
import { StockCard } from "@/components/products/StockCard";
import { CatalogInfoCard } from "@/components/products/CatalogInfoCard";
import { PricingCard } from "@/components/products/PricingCard";
import { CostMarginCard } from "@/components/products/CostMarginCard";
import { AdjustStockDialog } from "@/components/stock/AdjustStockDialog";
import { useInventoryAdjustments } from "@/lib/stock/useInventoryAdjustments";
import { PriceHistoryCard } from "@/components/products/PriceHistoryCard";
import { InfoSheetCard } from "@/components/products/InfoSheetCard";
import { SpecificationsCard } from "@/components/products/SpecificationsCard";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { SetPriceDialog } from "@/components/products/SetPriceDialog";
import { Tag } from "@/components/ui/Tag";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/layout/ToastProvider";
import { apiFetch, ApiError, extractErrorMessage } from "@/lib/api-client";
import type { EmployeeRole, Product } from "@/lib/types";

const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];

const STATUS_TAG = {
  ok: { label: "OK", variant: "accent" as const },
  low_stock: { label: "Low stock", variant: "outline" as const },
  out_of_stock: { label: "Out of stock", variant: "neutral" as const },
};

function deriveStatus(quantityInStock: number, reorderLevel: number): keyof typeof STATUS_TAG {
  if (quantityInStock === 0) return "out_of_stock";
  if (quantityInStock <= reorderLevel) return "low_stock";
  return "ok";
}

interface ProductDetailPageClientProps {
  productId: number;
  role: EmployeeRole;
}

export default function ProductDetailPageClient({ productId, role }: ProductDetailPageClientProps) {
  const detail = useProductDetail(productId);
  const isAdmin = ADMIN_ROLES.includes(role);
  const profitability = useProductProfitability(productId, isAdmin);
  const adjustments = useInventoryAdjustments(detail.inventory?.inventory_id, isAdmin);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();
  const { show } = useToast();

  async function handleDelete() {
    if (!detail.product) return;
    const confirmed = window.confirm(
      `Delete "${detail.product.name}"? This also removes its stock record, pricing history and any tracked equipment units. This can't be undone.`
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      await apiFetch(`products/${productId}/`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      show("Product deleted.", "success");
      router.push("/products");
    } catch (error) {
      const message =
        error instanceof ApiError ? extractErrorMessage(error.body) : "Something went wrong — try again.";
      show(message, "error");
      setDeleting(false);
    }
  }

  async function handleToggleActive() {
    if (!detail.product) return;
    const nextActive = !detail.product.is_active;
    setTogglingActive(true);
    try {
      await apiFetch<Product>(`products/${productId}/set-active/`, {
        method: "POST",
        body: JSON.stringify({ is_active: nextActive }),
      });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products", productId] });
      show(nextActive ? "Product reactivated." : "Product deactivated.", "success");
    } catch (error) {
      const message =
        error instanceof ApiError ? extractErrorMessage(error.body) : "Something went wrong — try again.";
      show(message, "error");
    } finally {
      setTogglingActive(false);
    }
  }

  if (detail.isError) {
    return (
      <ErrorState message="Couldn't load this product." />
    );
  }

  if (detail.isLoading || !detail.product) {
    return <p className="text-sm text-text/50">Loading product…</p>;
  }

  const status = deriveStatus(detail.inventory?.quantity_in_stock ?? 0, detail.product.reorder_level);
  const statusTag = STATUS_TAG[status];

  return (
    <div>
      <Link href="/products" className="text-sm">
        ← Products
      </Link>
      <div className="flex items-center gap-3 my-4">
        <h3 className="m-0">{detail.product.name}</h3>
        <Tag variant={statusTag.variant}>{statusTag.label}</Tag>
        {detail.product.is_active === false && <Tag variant="neutral">Inactive</Tag>}
        <span className="font-mono text-xs text-text/50">{detail.product.barcode}</span>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" href={buildReorderUrl(detail.product.product_id, detail.product.name)}>
            Reorder
          </Button>
          {isAdmin && <Button onClick={() => setEditOpen(true)}>Edit</Button>}
          {isAdmin && (
            <Button variant="secondary" onClick={handleToggleActive} disabled={togglingActive}>
              {togglingActive ? "Saving…" : detail.product.is_active === false ? "Reactivate" : "Deactivate"}
            </Button>
          )}
          {isAdmin && (
            <Button variant="secondary" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <StockCard
          inventory={detail.inventory}
          reorderLevel={detail.product.reorder_level}
          onAdjust={isAdmin && detail.inventory ? () => setAdjustOpen(true) : undefined}
        />
        {isAdmin && <PricingCard currentPricing={detail.currentPricing} onSetPrice={() => setPriceOpen(true)} />}
        {isAdmin && (
          <CostMarginCard
            row={profitability.row}
            isLoading={profitability.isLoading}
            isError={profitability.isError}
          />
        )}
        <CatalogInfoCard
          productId={detail.product.product_id}
          category={detail.category}
          brand={detail.product.brand}
          modelNumber={detail.product.model_number}
          warrantyMonths={detail.product.warranty_months ?? 0}
          unitCount={detail.trackedSerialCount}
          description={detail.product.description}
          unit={detail.product.unit}
          taxCategory={detail.product.tax_category}
          createdAt={detail.product.created_at}
        />
      </div>
      {isAdmin && adjustments.adjustments.length > 0 && (
        <div className="mb-4 text-sm">
          <span className="text-xs uppercase tracking-wide text-accent">Recent stock adjustments</span>
          <ul className="mt-1 flex flex-col gap-0.5 list-none m-0 p-0">
            {adjustments.adjustments.slice(0, 5).map((a) => (
              <li key={a.adjustment_id} className="flex gap-3 text-text/70">
                <span className="w-24 shrink-0 text-xs">
                  {new Date(a.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
                <span>
                  {a.adjustment_type.replace(/_/g, " ")} · {a.quantity} · stock {a.before_in_stock}→{a.after_in_stock}
                  {" · "}
                  <span className="text-text/50">{a.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
        <div className="flex flex-col gap-4">
          <InfoSheetCard
            usageInstructions={detail.product.usage_instructions}
            onEdit={isAdmin ? () => setEditOpen(true) : undefined}
          />
          <SpecificationsCard specifications={detail.product.specifications} />
        </div>
        <PriceHistoryCard history={detail.priceHistory} onSetNewPrice={() => setPriceOpen(true)} showWholesale={isAdmin} />
      </div>
      <ProductFormDialog
        open={editOpen}
        mode="edit"
        categories={detail.category ? [detail.category] : []}
        initialProduct={detail.product}
        initialStorageLocation={detail.inventory?.storage_location ?? null}
        inventoryId={detail.inventory?.inventory_id}
        onClose={() => setEditOpen(false)}
        onSaved={() => setEditOpen(false)}
      />
      {detail.inventory && (
        <AdjustStockDialog
          open={adjustOpen}
          inventoryId={detail.inventory.inventory_id}
          productName={detail.product.name}
          quantities={{
            in_stock: detail.inventory.quantity_in_stock,
            in_use: detail.inventory.quantity_in_use,
            damaged: detail.inventory.quantity_damaged,
          }}
          onClose={() => setAdjustOpen(false)}
          onSaved={() => setAdjustOpen(false)}
        />
      )}
      <SetPriceDialog
        open={priceOpen}
        productId={productId}
        isAdmin={isAdmin}
        onClose={() => setPriceOpen(false)}
        onSaved={() => setPriceOpen(false)}
      />
    </div>
  );
}
