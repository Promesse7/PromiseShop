"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PackageOpen } from "lucide-react";
import { fetchAllPages } from "@/lib/api-client";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { useRemovePurchaseItem } from "@/lib/purchasing/useRemovePurchaseItem";
import { describeLine, unitsOf } from "@/lib/purchasing/lineKinds";
import { formatRwf } from "@/lib/format";
import type { Category, Product, PurchaseItem } from "@/lib/types";

interface PurchaseItemsListProps {
  purchaseId: number;
  items: PurchaseItem[];
  editable: boolean;
  // Cost columns are only meaningful for roles the API sends cost fields to
  // (admin, manager); other roles get the plain product/qty/barcode view.
  showCosts?: boolean;
}

// Pack and bundle prices are per pack / per bundle; say so next to the figure.
function priceSuffix(item: PurchaseItem): string {
  if (item.line_kind === "pack") return " / pack";
  if (item.line_kind === "bundle") return " / bundle";
  return "";
}

// Signed difference between what the supplier invoiced and what was paid, for the
// whole line. Positive means billed more than paid (e.g. a verbal discount).
function formatDifference(item: PurchaseItem): string {
  if (item.unit_cost_paid == null || item.unit_cost_invoiced == null) return "—";
  const diff = (Number(item.unit_cost_invoiced) - Number(item.unit_cost_paid)) * item.quantity;
  if (diff === 0) return "0";
  return formatRwf(diff, { sign: true });
}

/** The lines on a purchase: a table on desktop, one card per line on phone. */
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

  const costColumns: DataColumn<PurchaseItem>[] = showCosts
    ? [
        {
          key: "unit_cost_paid",
          header: "Paid",
          align: "right",
          render: (item) => (
            <span className="tabular-nums">
              {formatRwf(item.unit_cost_paid)}
              <span className="text-xs text-text/50">{priceSuffix(item)}</span>
              {item.line_kind === "pack" && (
                <span className="block text-xs text-text/50">{formatRwf(item.unit_cost_paid_per_unit)} / unit</span>
              )}
            </span>
          ),
        },
        {
          key: "unit_cost_invoiced",
          header: "Invoiced",
          align: "right",
          mobile: false,
          render: (item) => (
            <span className="tabular-nums">
              {formatRwf(item.unit_cost_invoiced)}
              <span className="text-xs text-text/50">{priceSuffix(item)}</span>
            </span>
          ),
        },
        {
          key: "difference",
          header: "Difference",
          align: "right",
          mobile: false,
          render: (item) => <span className="tabular-nums">{formatDifference(item)}</span>,
        },
        {
          key: "price_discrepancy_note",
          header: "Note",
          mobile: false,
          render: (item) => <span className="text-xs text-text/70">{item.price_discrepancy_note || "—"}</span>,
        },
      ]
    : [];

  const columns: DataColumn<PurchaseItem>[] = [
    {
      key: "product",
      header: "Product",
      primary: true,
      render: (item) => (
        <div className="whitespace-normal">
          <span>{describeLine(item, item.product != null ? productById.get(item.product)?.name ?? null : null)}</span>
          {item.line_kind === "bundle" && (
            <ul className="mt-1 text-xs font-normal text-text/60">
              {(item.components ?? []).map((c) => (
                <li key={c.component_id}>
                  {c.product_name} × {c.qty_per_bundle} per bundle = {c.units}
                  {showCosts && c.unit_paid_cost != null && (
                    <span className="tabular-nums"> · {formatRwf(c.unit_paid_cost)} / unit</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ),
    },
    { key: "quantity", header: "Qty", align: "right", mobile: true },
    {
      key: "units",
      header: "Units in",
      align: "right",
      mobile: true,
      render: (item) => <span className="tabular-nums">{unitsOf(item)}</span>,
    },
    ...costColumns.map((c) => (c.key === "unit_cost_paid" ? { ...c, mobile: true } : c)),
    {
      key: "barcode",
      header: "Shop barcode",
      mobile: false,
      render: (item) =>
        item.line_kind === "bundle" ? (
          <span className="font-mono text-xs">{(item.components ?? []).map((c) => c.product_barcode).join(", ") || "—"}</span>
        ) : (
          <span className="font-mono text-xs">
            {(item.product != null ? productById.get(item.product)?.barcode : undefined) ?? "—"}
          </span>
        ),
    },
    {
      key: "actions",
      header: "",
      mobile: true,
      render: (item) => {
        const product = item.product != null ? productById.get(item.product) : undefined;
        return (
          <div className="flex flex-wrap items-center justify-end gap-2">
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
      <DataTable
        label="Items on this purchase"
        columns={columns}
        rows={items}
        rowKey={(i) => String(i.purchase_item_id)}
        empty={
          <EmptyState
            icon={PackageOpen}
            title="No items on this purchase yet"
            message={editable ? "Add products above, or scan them in." : undefined}
          />
        }
      />
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
