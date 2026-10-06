"use client";

import { SharedElement, sharedName } from "@/components/ui/SharedElement";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { PackageSearch } from "lucide-react";
import { Card, CardKicker, CardTitle, CardMeta } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/Tag";
import { formatRwf } from "@/lib/format";
import { listContainer, listItem, useReducedMotionSafe } from "@/lib/motion";
import type { CatalogProduct } from "@/lib/products/useCatalogProducts";

const STATUS_TAG: Record<CatalogProduct["status"], { label: string; variant: "accent" | "outline" | "neutral" }> = {
  ok: { label: "OK", variant: "accent" },
  low_stock: { label: "Low stock", variant: "outline" },
  out_of_stock: { label: "Out of stock", variant: "neutral" },
};

interface ProductCardGridProps {
  products: CatalogProduct[];
  showWholesale: boolean;
  selectedIds?: Set<number>;
  onToggleSelect?: (productId: number) => void;
  onPrintLabel?: (product: CatalogProduct) => void;
}

export function ProductCardGrid({
  products,
  showWholesale,
  selectedIds,
  onToggleSelect,
  onPrintLabel,
}: ProductCardGridProps) {
  const reduced = useReducedMotionSafe();

  if (products.length === 0) {
    return <EmptyState icon={PackageSearch} title="No products found" message="Try a different search or filter." />;
  }

  return (
    <motion.ul
      className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      {...(reduced ? { initial: false as const } : { variants: listContainer, initial: "hidden", animate: "show" })}
    >
      <AnimatePresence initial={false}>
        {products.map((p) => {
          const tag = STATUS_TAG[p.status];
          const selected = selectedIds?.has(p.product_id) ?? false;
          return (
            <motion.li
              key={p.product_id}
              layout={!reduced}
              variants={reduced ? undefined : listItem}
              exit={reduced ? undefined : "exit"}
              whileTap={reduced ? undefined : { scale: 0.985 }}
            >
              <Card
                elevation="sm"
                className={`h-full transition-shadow hover:shadow-md ${selected ? "ring-2 ring-accent/60" : ""}`}
              >
                <div className="flex items-start gap-2">
                  {onToggleSelect && (
                    <input
                      type="checkbox"
                      aria-label={`Select ${p.name}`}
                      checked={selected}
                      onChange={() => onToggleSelect(p.product_id)}
                      className="mt-1"
                    />
                  )}
                  <CardKicker>{p.category_name}</CardKicker>
                </div>
                <CardTitle>
                  <SharedElement name={sharedName("product", p.product_id)}>
                    <Link href={`/products/${p.product_id}`} className="text-text no-underline hover:text-accent">
                      {p.name}
                    </Link>
                  </SharedElement>
                </CardTitle>
                {(p.brand || p.model_number) && (
                  <CardMeta>{[p.brand, p.model_number].filter(Boolean).join(" · ")}</CardMeta>
                )}
                <span className="font-mono text-xs text-text/50">{p.barcode}</span>
                <div className="mt-1 flex items-baseline gap-2">
                  {p.has_price ? (
                    <span className="font-sans text-lg font-medium tabular-nums">{formatRwf(p.retail_price)}</span>
                  ) : (
                    <Tag variant="warning">Needs price</Tag>
                  )}
                  {showWholesale && p.wholesale_price != null && (
                    <span className="text-xs text-text/50">wholesale {formatRwf(p.wholesale_price)}</span>
                  )}
                </div>
                <div className="mt-auto flex items-center gap-2 pt-1">
                  <span className="text-xs text-text/50">{p.quantity_in_stock} in stock</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    {p.is_active === false && <Tag variant="neutral">Inactive</Tag>}
                    {p.has_inventory ? (
                      <Tag variant={tag.variant}>{tag.label}</Tag>
                    ) : (
                      <Tag variant="neutral">Not yet received</Tag>
                    )}
                  </div>
                </div>
                {onPrintLabel && (
                  <div className="flex justify-end">
                    <button type="button" className="text-xs text-accent underline" onClick={() => onPrintLabel(p)}>
                      Print label
                    </button>
                  </div>
                )}
              </Card>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </motion.ul>
  );
}
