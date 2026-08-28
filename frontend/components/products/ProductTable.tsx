"use client";

import Link from "next/link";
import { Table } from "@/components/ui/Table";
import { Tag } from "@/components/ui/Tag";
import type { CatalogProduct } from "@/lib/products/useCatalogProducts";

const STATUS_TAG: Record<CatalogProduct["status"], { label: string; variant: "accent" | "outline" | "neutral" }> = {
  ok: { label: "OK", variant: "accent" },
  low_stock: { label: "Low stock", variant: "outline" },
  out_of_stock: { label: "Out of stock", variant: "neutral" },
};

interface ProductTableProps {
  products: CatalogProduct[];
  showWholesale: boolean;
}

export function ProductTable({ products, showWholesale }: ProductTableProps) {
  const columns = [
    {
      key: "name",
      header: "Product",
      render: (p: CatalogProduct) => (
        <>
          {p.name}
          <br />
          <span className="text-xs text-text/50">
            {p.brand} · {p.model_number}
          </span>
        </>
      ),
    },
    { key: "category_name", header: "Category" },
    {
      key: "barcode",
      header: "Barcode",
      render: (p: CatalogProduct) => <span className="font-mono text-xs">{p.barcode}</span>,
    },
    {
      key: "retail_price",
      header: "Retail",
      render: (p: CatalogProduct) => p.retail_price.toLocaleString(),
    },
    ...(showWholesale
      ? [
          {
            key: "wholesale_price",
            header: "Wholesale",
            render: (p: CatalogProduct) =>
              p.wholesale_price != null ? (
                <span className="text-text/50">{p.wholesale_price.toLocaleString()}</span>
              ) : (
                "—"
              ),
          },
        ]
      : []),
    { key: "quantity_in_stock", header: "In stock" },
    {
      key: "status",
      header: "Status",
      render: (p: CatalogProduct) => {
        const tag = STATUS_TAG[p.status];
        return (
          <div className="flex items-center gap-1.5">
            {p.is_active === false && <Tag variant="neutral">Inactive</Tag>}
            <Tag variant={tag.variant}>{tag.label}</Tag>
          </div>
        );
      },
    },
    {
      key: "open",
      header: "",
      render: (p: CatalogProduct) => <Link href={`/products/${p.product_id}`}>Open</Link>,
    },
  ];

  return (
    <Table columns={columns} rows={products} rowKey={(p) => String(p.product_id)} emptyMessage="No products found" />
  );
}
