"use client";

import { useState } from "react";
import Link from "next/link";
import { useProductDetail } from "@/lib/products/useProductDetail";
import { StockCard } from "@/components/products/StockCard";
import { CatalogInfoCard } from "@/components/products/CatalogInfoCard";
import { PricingCard } from "@/components/products/PricingCard";
import { PriceHistoryCard } from "@/components/products/PriceHistoryCard";
import { InfoSheetCard } from "@/components/products/InfoSheetCard";
import { SpecificationsCard } from "@/components/products/SpecificationsCard";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { SetPriceDialog } from "@/components/products/SetPriceDialog";
import { Tag } from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import type { EmployeeRole } from "@/lib/types";

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
  const [editOpen, setEditOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);

  if (detail.isError) {
    return (
      <div className="text-sm text-red-400">
        Couldn&apos;t load this product.{" "}
        <button type="button" className="underline" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
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
        <span className="font-mono text-xs text-text/50">{detail.product.barcode}</span>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" disabled>
            Reorder
          </Button>
          {isAdmin && <Button onClick={() => setEditOpen(true)}>Edit</Button>}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <StockCard inventory={detail.inventory} />
        {isAdmin && <PricingCard currentPricing={detail.currentPricing} />}
        <CatalogInfoCard
          category={detail.category}
          brand={detail.product.brand}
          modelNumber={detail.product.model_number}
          warrantyMonths={detail.product.warranty_months ?? 0}
          hasTrackedSerials={detail.hasTrackedSerials}
        />
      </div>
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
