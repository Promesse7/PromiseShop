"use client";

import { PackageSearch } from "lucide-react";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/Tag";
import { formatRwf } from "@/lib/format";
import type { CatalogProduct } from "@/lib/products/useCatalogProducts";

const STATUS_TAG: Record<CatalogProduct["status"], { label: string; variant: "accent" | "outline" | "neutral" }> = {
  ok: { label: "OK", variant: "accent" },
  low_stock: { label: "Low stock", variant: "outline" },
  out_of_stock: { label: "Out of stock", variant: "neutral" },
};

function StatusTags({ product }: { product: CatalogProduct }) {
  const tag = STATUS_TAG[product.status];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {product.is_active === false && <Tag variant="neutral">Inactive</Tag>}
      {product.has_inventory ? (
        <Tag variant={tag.variant}>{tag.label}</Tag>
      ) : (
        <Tag variant="neutral">Not yet received</Tag>
      )}
    </div>
  );
}

interface ProductTableProps {
  products: CatalogProduct[];
  showWholesale: boolean;
}

export function ProductTable({ products, showWholesale }: ProductTableProps) {
  const columns: DataColumn<CatalogProduct>[] = [
    {
      key: "name",
      header: "Product",
      primary: true,
      sortValue: (p) => p.name,
      render: (p) => (
        <span className="flex flex-col">
          <span>{p.name}</span>
          {(p.brand || p.model_number) && (
            <span className="text-xs font-normal text-text/50">
              {[p.brand, p.model_number].filter(Boolean).join(" · ")}
            </span>
          )}
        </span>
      ),
    },
    { key: "category_name", header: "Category", sortValue: (p) => p.category_name, mobile: false },
    {
      key: "barcode",
      header: "Barcode",
      mobile: false,
      render: (p) => <span className="font-mono text-xs">{p.barcode}</span>,
    },
    {
      key: "retail_price",
      header: "Retail",
      align: "right",
      mobile: true,
      sortValue: (p) => p.retail_price,
      render: (p) => (p.has_price ? formatRwf(p.retail_price) : <Tag variant="warning">Needs price</Tag>),
    },
    ...(showWholesale
      ? [
          {
            key: "wholesale_price",
            header: "Wholesale",
            align: "right" as const,
            mobile: false,
            sortValue: (p: CatalogProduct) => p.wholesale_price ?? -1,
            render: (p: CatalogProduct) => (
              <span className="text-text/50">{p.wholesale_price != null ? formatRwf(p.wholesale_price) : "—"}</span>
            ),
          },
        ]
      : []),
    {
      key: "quantity_in_stock",
      header: "In stock",
      align: "right",
      mobile: true,
      sortValue: (p) => p.quantity_in_stock,
    },
    { key: "status", header: "Status", mobile: true, render: (p) => <StatusTags product={p} /> },
  ];

  return (
    <DataTable
      label="Products"
      columns={columns}
      rows={products}
      rowKey={(p) => String(p.product_id)}
      rowHref={(p) => `/products/${p.product_id}`}
      empty={<EmptyState icon={PackageSearch} title="No products found" message="Try a different search or filter." />}
    />
  );
}
