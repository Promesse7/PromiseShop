"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAllPages } from "@/lib/api-client";
import { Table } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { useRemovePurchaseItem } from "@/lib/purchasing/useRemovePurchaseItem";
import type { Category, Product, PurchaseItem } from "@/lib/types";

interface PurchaseItemsListProps {
  purchaseId: number;
  items: PurchaseItem[];
  editable: boolean;
  // Cost columns are only meaningful for roles the API sends cost fields to
  // (admin, manager); other roles get the plain product/qty/barcode view.
  showCosts?: boolean;
}

function formatMoney(value?: string): string {
  if (value == null) return "—";
  return Number(value).toLocaleString();
}

// Signed difference between what the supplier invoiced and what was paid, for the
// whole line. Positive means billed more than paid (e.g. a verbal discount).
function formatDifference(item: PurchaseItem): string {
  if (item.unit_cost_paid == null || item.unit_cost_invoiced == null) return "—";
  const diff = (Number(item.unit_cost_invoiced) - Number(item.unit_cost_paid)) * item.quantity;
  if (diff === 0) return "0";
  return `${diff > 0 ? "+" : "−"}${Math.abs(diff).toLocaleString()}`;
}

export function PurchaseItemsList({ purchaseId, items, editable, showCosts = false }: PurchaseItemsListProps) {
  const productsQuery = useQuery({ queryKey: ["products"], queryFn: () => fetchAllPages<Product>("products/") });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: () => fetchAllPages<Category>("categories/") });
  const removeItem = useRemovePurchaseItem();
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const productById = useMemo(() => {
    const map = new Map<number, Product>();
    for (const p of productsQuery.data ?? []) map.set(p.product_id, p);
    return map;
  }, [productsQuery.data]);

  const costColumns = showCosts
    ? [
        {
          key: "unit_cost_paid",
          header: "Paid / unit",
          render: (item: PurchaseItem) => <span className="tabular-nums">{formatMoney(item.unit_cost_paid)}</span>,
        },
        {
          key: "unit_cost_invoiced",
          header: "Invoiced / unit",
          render: (item: PurchaseItem) => <span className="tabular-nums">{formatMoney(item.unit_cost_invoiced)}</span>,
        },
        {
          key: "difference",
          header: "Difference",
          render: (item: PurchaseItem) => <span className="tabular-nums">{formatDifference(item)}</span>,
        },
        {
          key: "price_discrepancy_note",
          header: "Note",
          render: (item: PurchaseItem) => (
            <span className="text-xs text-text/70">{item.price_discrepancy_note || "—"}</span>
          ),
        },
      ]
    : [];

  const columns = [
    {
      key: "product",
      header: "Product",
      render: (item: PurchaseItem) => productById.get(item.product)?.name ?? `Product #${item.product}`,
    },
    { key: "quantity", header: "Qty" },
    ...costColumns,
    {
      key: "barcode",
      header: "Shop barcode",
      render: (item: PurchaseItem) => (
        <span className="font-mono text-xs">{productById.get(item.product)?.barcode ?? "—"}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (item: PurchaseItem) => {
        const product = productById.get(item.product);
        return (
          <div className="flex gap-2 items-center justify-end">
            <Button variant="ghost" disabled title="Not available — barcodes are shop-assigned once, at entry.">
              Regenerate
            </Button>
            {product && (
              <Button variant="ghost" onClick={() => setEditingProduct(product)}>
                Edit product
              </Button>
            )}
            {editable && (
              <Button
                variant="ghost"
                onClick={() => removeItem.mutate({ purchaseId, itemId: item.purchase_item_id })}
              >
                Remove
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <Table columns={columns} rows={items} rowKey={(i) => String(i.purchase_item_id)} emptyMessage="No items on this purchase yet" />
      {editingProduct && (
        <ProductFormDialog
          open={!!editingProduct}
          mode="edit"
          categories={categoriesQuery.data ?? []}
          initialProduct={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSaved={() => setEditingProduct(null)}
        />
      )}
    </>
  );
}
