"use client";

import { sharedName } from "@/components/ui/SharedElement";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useProductDetail } from "@/lib/products/useProductDetail";
import { useProductProfitability } from "@/lib/products/useProductProfitability";
import { buildReorderUrl } from "@/lib/purchasing/reorderUrl";
import { StockCard } from "@/components/products/StockCard";
import { CatalogInfoCard } from "@/components/products/CatalogInfoCard";
import { PricingCard } from "@/components/products/PricingCard";
import { CostMarginCard } from "@/components/products/CostMarginCard";
import { AdjustStockDialog } from "@/components/stock/AdjustStockDialog";
import { ProductMovementsCard } from "@/components/stock/ProductMovementsCard";
import { PriceHistoryCard } from "@/components/products/PriceHistoryCard";
import { InfoSheetCard } from "@/components/products/InfoSheetCard";
import { SpecificationsCard } from "@/components/products/SpecificationsCard";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { SetPriceDialog } from "@/components/products/SetPriceDialog";
import { OpeningStockDialog } from "@/components/products/OpeningStockDialog";
import { ProductLabel } from "@/components/products/ProductLabel";
import { UseInShopDialog } from "@/components/operations/UseInShopDialog";
import { ConsumptionTable } from "@/components/operations/ConsumptionTable";
import { useConsumptions } from "@/lib/operations/useShopUse";
import { useOpeningStockStatus } from "@/lib/products/useOpeningStock";
import { Page, type PageAction } from "@/components/ui/Page";
import { StatStrip } from "@/components/finance/StatStrip";
import { Tabs } from "@/components/ui/Tabs";
import { Tag } from "@/components/ui/Tag";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { LabelSheet } from "@/components/ui/LabelSheet";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmProvider";
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

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "pricing", label: "Pricing" },
  { id: "stock", label: "Stock & movements" },
  { id: "shop-use", label: "Shop use" },
];

function ProductShopUse({ productId, showValue }: { productId: number; showValue: boolean }) {
  const consumptions = useConsumptions({ product: productId });
  if (consumptions.isError) return <ErrorState message="Couldn't load what the shop used." />;
  if (consumptions.isLoading) return <LoadingState variant="table" rows={3} label="Loading shop use…" />;
  return (
    <ConsumptionTable
      rows={consumptions.consumptions}
      showValue={showValue}
      hideProduct
      emptyMessage="Nothing used in the shop yet"
    />
  );
}

interface ProductDetailPageClientProps {
  productId: number;
  role: EmployeeRole;
}

export default function ProductDetailPageClient({ productId, role }: ProductDetailPageClientProps) {
  const detail = useProductDetail(productId);
  const isAdmin = ADMIN_ROLES.includes(role);
  const profitability = useProductProfitability(productId, isAdmin);
  const isStrictAdmin = role === "admin";
  const openingStatus = useOpeningStockStatus(productId, isStrictAdmin);
  const [tab, setTab] = useState("overview");
  const [openingOpen, setOpeningOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [useInShopOpen, setUseInShopOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();
  const confirm = useConfirm();
  const { show } = useToast();

  useEffect(() => {
    if (!printing) return;
    // Register before print(): print() blocks and fires "afterprint" before returning.
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    window.print();
    return () => window.removeEventListener("afterprint", done);
  }, [printing]);

  async function handleDelete() {
    if (!detail.product) return;
    const confirmed = await confirm({
      title: `Delete "${detail.product.name}"?`,
      message:
        "This also removes its stock record, pricing history and any tracked equipment units. This can't be undone.",
      confirmLabel: "Delete product",
      tone: "danger",
    });
    if (!confirmed) return;
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
    }
  }

  async function handleToggleActive() {
    if (!detail.product) return;
    const nextActive = !detail.product.is_active;
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
    }
  }

  if (detail.isError) {
    return (
      <Page title="Product" back="/products">
        <ErrorState message="Couldn't load this product." />
      </Page>
    );
  }

  if (detail.isLoading || !detail.product) {
    return <LoadingState variant="detail" label="Loading product…" />;
  }

  const product = detail.product;
  const inStock = detail.inventory?.quantity_in_stock ?? 0;
  const status = deriveStatus(inStock, product.reorder_level);
  const statusTag = STATUS_TAG[status];
  const retail = detail.currentPricing ? Number(detail.currentPricing.retail_price) : null;
  const row = profitability.row;

  const secondaryActions: PageAction[] = isAdmin
    ? [
        ...(detail.inventory ? [{ label: "Adjust stock", onSelect: () => setAdjustOpen(true) }] : []),
        { label: "Set new price", onSelect: () => setPriceOpen(true) },
        ...(isStrictAdmin && openingStatus.data?.eligible
          ? [{ label: "Set opening stock", onSelect: () => setOpeningOpen(true) }]
          : []),
        { label: product.is_active === false ? "Reactivate" : "Deactivate", onSelect: handleToggleActive },
        { label: "Delete", onSelect: handleDelete },
      ]
    : [];

  return (
    <Page
      title={product.name}
      sharedName={sharedName("product", product.product_id)}
      breadcrumb={[{ label: "Stock" }, { label: "Products", href: "/products" }, { label: product.name }]}
      back="/products"
      primaryAction={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" href={buildReorderUrl(product.product_id, product.name)}>
            Reorder
          </Button>
          <Button variant="secondary" onClick={() => setUseInShopOpen(true)} disabled={inStock < 1}>
            Use in shop
          </Button>
          {isAdmin && <Button onClick={() => setEditOpen(true)}>Edit</Button>}
        </div>
      }
      secondaryActions={secondaryActions}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Tag variant={statusTag.variant}>{statusTag.label}</Tag>
          {product.is_active === false && <Tag variant="neutral">Inactive</Tag>}
          <span className="font-mono text-xs text-text/50">{product.barcode}</span>
          <button
            type="button"
            onClick={() => setPrinting(true)}
            className="inline-flex items-center gap-1 text-xs text-accent underline"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden />
            Print label
          </button>
        </div>

        <StatStrip
          label="Key figures"
          stats={[
            {
              label: "In stock",
              value: inStock,
              hint: `reorder at ${product.reorder_level}`,
              tone: status === "ok" ? "default" : "danger",
            },
            retail !== null
              ? { label: "Retail price", amount: retail }
              : { label: "Retail price", value: "Not priced", tone: "muted" as const },
            ...(isAdmin
              ? [
                  { label: "Avg cost", amount: row?.avg_cost_paid ?? null },
                  { label: "Margin", value: row?.margin_pct ? `${row.margin_pct}%` : "—", hint: "all time" },
                ]
              : []),
          ]}
        />

        <Tabs tabs={TABS} value={tab} onChange={setTab} label="Product sections">
          {(active) => (
            <>
              {active === "overview" && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.3fr]">
                  <CatalogInfoCard
                    productId={product.product_id}
                    category={detail.category}
                    brand={product.brand}
                    modelNumber={product.model_number}
                    warrantyMonths={product.warranty_months ?? 0}
                    unitCount={detail.trackedSerialCount}
                    description={product.description}
                    unit={product.unit}
                    taxCategory={product.tax_category}
                    createdAt={product.created_at}
                  />
                  <div className="flex flex-col gap-4">
                    <InfoSheetCard
                      usageInstructions={product.usage_instructions}
                      onEdit={isAdmin ? () => setEditOpen(true) : undefined}
                    />
                    <SpecificationsCard specifications={product.specifications} />
                  </div>
                </div>
              )}
              {active === "pricing" && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {isAdmin && <PricingCard currentPricing={detail.currentPricing} onSetPrice={() => setPriceOpen(true)} />}
                  {isAdmin && (
                    <CostMarginCard
                      row={profitability.row}
                      isLoading={profitability.isLoading}
                      isError={profitability.isError}
                      productId={product.product_id}
                    />
                  )}
                  <div className="lg:col-span-2">
                    <PriceHistoryCard
                      history={detail.priceHistory}
                      onSetNewPrice={() => setPriceOpen(true)}
                      showWholesale={isAdmin}
                      canSetPrice={isAdmin}
                    />
                  </div>
                </div>
              )}
              {active === "stock" && (
                <div className="flex flex-col gap-4">
                  <div className="max-w-xl">
                    <StockCard
                      inventory={detail.inventory}
                      reorderLevel={product.reorder_level}
                      onAdjust={isAdmin && detail.inventory ? () => setAdjustOpen(true) : undefined}
                    />
                  </div>
                  <ProductMovementsCard productId={productId} showCost={isAdmin} />
                </div>
              )}
              {active === "shop-use" && <ProductShopUse productId={productId} showValue={isAdmin} />}
            </>
          )}
        </Tabs>
      </div>

      {isStrictAdmin && (
        <OpeningStockDialog
          open={openingOpen}
          productId={productId}
          productName={product.name}
          currentInStock={openingStatus.data?.in_stock ?? inStock}
          onClose={() => setOpeningOpen(false)}
          onSaved={() => setOpeningOpen(false)}
        />
      )}
      <ProductFormDialog
        open={editOpen}
        mode="edit"
        categories={detail.category ? [detail.category] : []}
        initialProduct={product}
        initialStorageLocation={detail.inventory?.storage_location ?? null}
        inventoryId={detail.inventory?.inventory_id}
        onClose={() => setEditOpen(false)}
        onSaved={() => setEditOpen(false)}
      />
      {useInShopOpen && (
        <UseInShopDialog
          open
          product={{ product_id: product.product_id, name: product.name }}
          inStock={inStock}
          onClose={() => setUseInShopOpen(false)}
        />
      )}
      {detail.inventory && (
        <AdjustStockDialog
          open={adjustOpen}
          inventoryId={detail.inventory.inventory_id}
          productName={product.name}
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
      {printing && (
        <LabelSheet>
          <ProductLabel product={{ name: product.name, barcode: product.barcode, retail_price: retail ?? 0 }} />
        </LabelSheet>
      )}
    </Page>
  );
}
