"use client";

import Link from "next/link";
import { Card, CardKicker } from "@/components/ui/Card";
import { MovementsTable } from "@/components/stock/MovementsTable";
import { useStockMovements } from "@/lib/stock/useStockMovements";

const RECENT = 8;

interface ProductMovementsCardProps {
  productId: number;
  showCost: boolean;
}

// Latest ledger rows for one product, with a link to the full filterable list.
export function ProductMovementsCard({ productId, showCost }: ProductMovementsCardProps) {
  const { movements, count, isLoading, isError } = useStockMovements({ product: productId }, RECENT);
  // The ledger for a product includes products merged into it (Module E4): name them when present.
  const includesMerged = movements.some((m) => m.product !== productId);

  return (
    <Card elevation="sm" className="mb-4">
      <div className="flex items-center gap-3">
        <CardKicker>Stock movements</CardKicker>
        <Link href={`/stock/movements?product=${productId}`} className="ml-auto text-sm text-accent">
          {count > RECENT ? `All ${count} movements →` : "Open movements →"}
        </Link>
      </div>
      {isLoading ? (
        <p className="text-sm text-text/50">Loading movements…</p>
      ) : isError ? (
        <p className="text-sm text-text/50">Couldn&apos;t load stock movements.</p>
      ) : (
        <MovementsTable movements={movements} showCost={showCost} showProduct={includesMerged} emptyMessage="No stock movements yet" />
      )}
    </Card>
  );
}
