"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStockOverview } from "@/lib/stock/useStockOverview";
import { useEquipmentUnits } from "@/lib/stock/useEquipmentUnits";
import { StockOverviewCardGrid } from "@/components/stock/StockOverviewCardGrid";
import { SerializedUnitsTable } from "@/components/stock/SerializedUnitsTable";
import { RegisterUnitDialog } from "@/components/stock/RegisterUnitDialog";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Button } from "@/components/ui/Button";
import { CardKicker } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import { CardGridSkeleton } from "@/components/ui/CardGridSkeleton";
import { LabelSheet } from "@/components/ui/LabelSheet";
import { UnitLabel } from "@/components/stock/UnitLabel";
import type { EquipmentUnit } from "@/lib/types";

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
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<number>>(new Set());
  const [printQueue, setPrintQueue] = useState<EquipmentUnit[] | null>(null);
  const selectedProductUnits = useEquipmentUnits(selectedProductId);

  useEffect(() => {
    if (!printQueue) return;
    // window.print() blocks until the print dialog closes, firing "afterprint" before
    // returning — the listener must be registered before calling it, not after.
    const handleAfterPrint = () => setPrintQueue(null);
    window.addEventListener("afterprint", handleAfterPrint);
    window.print();
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, [printQueue]);

  function handleSelectProduct(productId: number) {
    setSelectedProductId(productId);
    setSelectedUnitIds(new Set());
  }

  function toggleSelectUnit(unitId: number) {
    setSelectedUnitIds((current) => {
      const next = new Set(current);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  }

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
      <ErrorState message="Couldn't load stock." />
    );
  }

  if (overview.isLoading) {
    return <CardGridSkeleton label="Loading stock…" />;
  }

  return (
    <div>
      <PageHeader title="Stock overview">
        <SegmentedToggle name="stk" options={FILTER_OPTIONS} value={filter} onChange={(v) => setFilter(v as StockFilter)} />
        <Link href="/stock/scan" className="ml-auto text-sm text-accent">
          Quick status change →
        </Link>
      </PageHeader>
      <StockOverviewCardGrid rows={filteredRows} onSelectProduct={handleSelectProduct} />
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
      {selectedUnitIds.size > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2 rounded-md bg-accent/10 text-sm">
          <span>{selectedUnitIds.size} selected</span>
          <Button
            variant="secondary"
            className="ml-auto"
            onClick={() =>
              setPrintQueue(selectedProductUnits.units.filter((u) => selectedUnitIds.has(u.unit_id)))
            }
          >
            Print {selectedUnitIds.size} labels
          </Button>
        </div>
      )}
      {selectedProduct ? (
        <SerializedUnitsTable
          units={selectedProductUnits.units}
          selectedIds={selectedUnitIds}
          onToggleSelect={toggleSelectUnit}
          onPrintLabel={(unit) => setPrintQueue([unit])}
        />
      ) : (
        <p className="text-sm text-text/50">Select a product above to view its serialized units</p>
      )}
      {selectedProductId !== null && (
        <RegisterUnitDialog
          open={registerOpen}
          productId={selectedProductId}
          productName={selectedProduct?.name ?? ""}
          onClose={() => setRegisterOpen(false)}
          onSaved={() => {}}
        />
      )}
      {printQueue && (
        <LabelSheet>
          {printQueue.map((unit) => (
            <UnitLabel key={unit.unit_id} productName={selectedProduct?.name ?? ""} serialNumber={unit.serial_number} />
          ))}
        </LabelSheet>
      )}
    </div>
  );
}
