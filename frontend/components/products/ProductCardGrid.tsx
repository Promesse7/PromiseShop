import Link from "next/link";
import { Card, CardKicker, CardTitle, CardMeta } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
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
  if (products.length === 0) {
    return <p className="text-sm text-text/50">No products found</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {products.map((p) => {
        const tag = STATUS_TAG[p.status];
        return (
          <Card key={p.product_id} elevation="sm" className="h-full">
            <div className="flex items-start gap-2">
              {onToggleSelect && (
                <input
                  type="checkbox"
                  aria-label={`Select ${p.name}`}
                  checked={selectedIds?.has(p.product_id) ?? false}
                  onChange={() => onToggleSelect(p.product_id)}
                  className="mt-1"
                />
              )}
              <CardKicker>{p.category_name}</CardKicker>
            </div>
            <CardTitle>{p.name}</CardTitle>
            <CardMeta>
              {p.brand} · {p.model_number}
            </CardMeta>
            <span className="font-mono text-xs text-text/50">{p.barcode}</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-sans font-medium text-lg">{p.retail_price.toLocaleString()}</span>
              {showWholesale && p.wholesale_price != null && (
                <span className="text-xs text-text/50">wholesale {p.wholesale_price.toLocaleString()}</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-auto pt-1">
              <span className="text-xs text-text/50">{p.quantity_in_stock} in stock</span>
              <div className="ml-auto flex items-center gap-1.5">
                {p.is_active === false && <Tag variant="neutral">Inactive</Tag>}
                <Tag variant={tag.variant}>{tag.label}</Tag>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Link href={`/products/${p.product_id}`} className="text-sm text-accent">
                Open →
              </Link>
              {onPrintLabel && (
                <button
                  type="button"
                  className="text-xs text-accent underline"
                  onClick={() => onPrintLabel(p)}
                >
                  Print label
                </button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
