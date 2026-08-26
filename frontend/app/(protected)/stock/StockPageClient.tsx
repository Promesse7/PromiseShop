"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStockOverview } from "@/lib/stock/useStockOverview";
import { useEquipmentUnits } from "@/lib/stock/useEquipmentUnits";
import { StockOverviewTable } from "@/components/stock/StockOverviewTable";
import { SerializedUnitsTable } from "@/components/stock/SerializedUnitsTable";
import { RegisterUnitDialog } from "@/components/stock/RegisterUnitDialog";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Button } from "@/components/ui/Button";
import { CardKicker } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

type StockFilter = "all" | "low_out" | "serialized";

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "low_out", label: "Low / out" },
  { value: "serialized", label: "Serialized only" },
];

export default function StockPageClient() {
  const overview = useStockOverview();
  const [filter, setFilter] = useState<StockFilter>("all");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const selectedProductUnits = useEquipmentUnits(selectedProductId);

  const filteredRows = useMemo(() => {
    if (filter === "low_out") {
      return overview.rows.filter((r) => r.flag !== "ok");
    }
    if (filter === "serialized") {
      return overview.rows.filter((r) => r.unit_count > 0);
    }
    return overview.rows;
  }, [overview.rows, filter]);

  const selectedProduct = overview.rows.find((r) => r.product_id === selectedProductId);

  if (overview.isError) {
    return (
      <div className="text-sm text-red-400">
        Couldn&apos;t load stock.{" "}
        <button type="button" className="underline" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  if (overview.isLoading) {
    return <p className="text-sm text-text/50">Loading stock…</p>;
  }

  return (
    <div>
      <PageHeader title="Stock overview">
        <SegmentedToggle name="stk" options={FILTER_OPTIONS} value={filter} onChange={(v) => setFilter(v as StockFilter)} />
        <Link href="/stock/scan" className="ml-auto text-sm text-accent">
          Quick status change →
        </Link>
      </PageHeader>
      <StockOverviewTable rows={filteredRows} onSelectProduct={setSelectedProductId} />
      <hr className="my-4 border-divider" />
      <div className="flex items-baseline gap-3 mb-2">
        <CardKicker>
          {selectedProduct ? `Serialized units — ${selectedProduct.name}` : "Serialized units"}
        </CardKicker>
        {selectedProduct && (
          <Button variant="ghost" className="ml-auto" onClick={() => setRegisterOpen(true)}>
            + Register unit
          </Button>
        )}
      </div>
      {selectedProduct ? (
        <SerializedUnitsTable units={selectedProductUnits.units} />
      ) : (
        <p className="text-sm text-text/50">Select a product above to view its serialized units</p>
      )}
      {selectedProductId !== null && (
        <RegisterUnitDialog
          open={registerOpen}
          productId={selectedProductId}
          onClose={() => setRegisterOpen(false)}
          onSaved={() => setRegisterOpen(false)}
        />
      )}
    </div>
  );
}
