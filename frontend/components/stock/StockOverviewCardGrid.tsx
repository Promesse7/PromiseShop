"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Boxes } from "lucide-react";
import { Card, CardTitle, CardMeta } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/Tag";
import { useReducedMotionSafe } from "@/lib/motion";
import { revealItemProps } from "@/lib/scroll/revealItemProps";
import type { StockOverviewRow } from "@/lib/stock/useStockOverview";

const FLAG_TAG: Record<StockOverviewRow["flag"], { label: string; variant: "accent" | "outline" | "neutral" } | null> = {
  ok: null,
  low_stock: { label: "Low stock", variant: "outline" },
  out_of_stock: { label: "Out of stock", variant: "neutral" },
};

interface StockOverviewCardGridProps {
  rows: StockOverviewRow[];
  onSelectProduct: (productId: number) => void;
  onAdjust?: (productId: number) => void;
  /** Highlights the card whose serialized units are open below. */
  selectedProductId?: number | null;
}

export function StockOverviewCardGrid({ rows, onSelectProduct, onAdjust, selectedProductId }: StockOverviewCardGridProps) {
  const reduced = useReducedMotionSafe();

  if (rows.length === 0) {
    return <EmptyState icon={Boxes} title="No stock recorded yet" message="Stock appears here once a purchase is received." />;
  }

  return (
    <motion.ul
      className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      <AnimatePresence initial={false}>
        {rows.map((row, index) => {
          const tag = FLAG_TAG[row.flag];
          const selected = row.product_id === selectedProductId;
          return (
            <motion.li
              key={row.product_id}
              layout={!reduced}
              {...revealItemProps(index, reduced)}
              exit={reduced ? undefined : "exit"}
              whileTap={reduced ? undefined : { scale: 0.985 }}
            >
              <Card elevation="sm" className={`h-full transition-shadow hover:shadow-md ${selected ? "ring-2 ring-accent/60" : ""}`}>
                <div className="flex items-start gap-2">
                  <CardTitle>
                    <Link href={`/products/${row.product_id}`} className="text-text no-underline hover:text-accent">
                      {row.name}
                    </Link>
                  </CardTitle>
                  {tag && (
                    <Tag variant={tag.variant} className="ml-auto shrink-0">
                      {tag.label}
                    </Tag>
                  )}
                </div>
                <CardMeta>{row.storage_location ?? "—"}</CardMeta>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Bucket label="in stock" value={row.quantity_in_stock} emphasis />
                  <Bucket label="in use" value={row.quantity_in_use} />
                  <Bucket label="damaged" value={row.quantity_damaged} />
                </div>
                <div className="mt-auto flex items-center gap-3 pt-1">
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
                  {onAdjust && (
                    <button
                      type="button"
                      className="ml-auto text-xs text-accent underline"
                      onClick={() => onAdjust(row.product_id)}
                    >
                      Adjust
                    </button>
                  )}
                </div>
              </Card>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </motion.ul>
  );
}

function Bucket({ label, value, emphasis = false }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div className="rounded-md bg-neutral-100 px-1 py-1.5">
      <div className={`tabular-nums ${emphasis ? "text-base font-medium" : "text-sm"}`}>{value}</div>
      <div className="text-[11px] text-text/50">{label}</div>
    </div>
  );
}
