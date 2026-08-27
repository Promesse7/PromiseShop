import { Card, CardTitle, CardMeta } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import type { StockOverviewRow } from "@/lib/stock/useStockOverview";

const FLAG_TAG: Record<StockOverviewRow["flag"], { label: string; variant: "accent" | "outline" | "neutral" } | null> = {
  ok: null,
  low_stock: { label: "Low stock", variant: "outline" },
  out_of_stock: { label: "Out of stock", variant: "neutral" },
};

interface StockOverviewCardGridProps {
  rows: StockOverviewRow[];
  onSelectProduct: (productId: number) => void;
}

export function StockOverviewCardGrid({ rows, onSelectProduct }: StockOverviewCardGridProps) {
  if (rows.length === 0) {
    return <p className="text-sm text-text/50">No stock recorded yet</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {rows.map((row) => {
        const tag = FLAG_TAG[row.flag];
        return (
          <Card key={row.product_id} elevation="sm" className="h-full">
            <div className="flex items-start gap-2">
              <CardTitle>{row.name}</CardTitle>
              {tag && (
                <Tag variant={tag.variant} className="ml-auto">
                  {tag.label}
                </Tag>
              )}
            </div>
            <CardMeta>{row.storage_location ?? "—"}</CardMeta>
            <div className="flex items-center gap-3 text-xs text-text/60">
              <span>{row.quantity_in_stock} in stock</span>
              <span>{row.quantity_in_use} in use</span>
              <span>{row.quantity_damaged} damaged</span>
            </div>
            <div className="mt-auto pt-1">
              {row.unit_count > 0 ? (
                <button
                  type="button"
                  className="text-xs text-accent underline"
                  onClick={() => onSelectProduct(row.product_id)}
                >
                  {row.unit_count} units
                </button>
              ) : (
                <span className="text-xs text-text/50">aggregate only</span>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
