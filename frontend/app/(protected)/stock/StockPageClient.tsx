"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStockOverview } from "@/lib/stock/useStockOverview";
import { useEquipmentUnits } from "@/lib/stock/useEquipmentUnits";
import { useEmployees } from "@/lib/employees/useEmployees";
import { StockOverviewCardGrid } from "@/components/stock/StockOverviewCardGrid";
import { SerializedUnitsTable } from "@/components/stock/SerializedUnitsTable";
import { RegisterUnitDialog } from "@/components/stock/RegisterUnitDialog";
import { AdjustStockDialog } from "@/components/stock/AdjustStockDialog";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Button } from "@/components/ui/Button";
import { CardKicker } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import { CardGridSkeleton } from "@/components/ui/CardGridSkeleton";
import { LabelSheet } from "@/components/ui/LabelSheet";
import { UnitLabel } from "@/components/stock/UnitLabel";
import type { EmployeeRole, EquipmentUnit } from "@/lib/types";

type StockFilter = "all" | "low_out" | "serialized";

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "low_out", label: "Low / out" },
  { value: "serialized", label: "Serialized only" },
];

const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];

interface StockPageClientProps {
  role?: EmployeeRole;
}

export default function StockPageClient({ role }: StockPageClientProps) {
  const overview = useStockOverview();
  const searchParams = useSearchParams();
  const isAdmin = role != null && ADMIN_ROLES.includes(role);
  const employees = useEmployees(isAdmin);
  const [filter, setFilter] = useState<StockFilter>("all");
  const [search, setSearch] = useState("");
  // The catalog deep-links here with ?product=<id> ("Track serials: On → N units").
  const [selectedProductId, setSelectedProductId] = useState<number | null>(() => {
    const param = searchParams.get("product");
    return param && Number.isFinite(Number(param)) ? Number(param) : null;
  });
  const [registerOpen, setRegisterOpen] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState<number | null>(null);
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
    const q = search.trim().toLowerCase();
    let rows = overview.rows;
    if (filter === "low_out") rows = rows.filter((r) => r.flag !== "ok");
    if (filter === "serialized") rows = rows.filter((r) => r.unit_count > 0);
    if (q) {
      rows = rows.filter(
        (r) => r.name.toLowerCase().includes(q) || (r.storage_location ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [overview.rows, filter, search]);

  const employeeNames = useMemo(
    () => new Map(employees.all.map((e) => [e.employee_id, e.full_name])),
    [employees.all]
  );

  const selectedProduct = overview.rows.find((r) => r.product_id === selectedProductId);
  const adjustRow = overview.rows.find((r) => r.product_id === adjustProductId);

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
        <input
          aria-label="Search stock"
          placeholder="Search product or location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-[260px] min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md ml-4"
        />
        <SegmentedToggle name="stk" options={FILTER_OPTIONS} value={filter} onChange={(v) => setFilter(v as StockFilter)} />
        <Link href="/stock/scan" className="ml-auto text-sm text-accent">
          Quick status change →
        </Link>
      </PageHeader>
      <StockOverviewCardGrid
        rows={filteredRows}
        onSelectProduct={handleSelectProduct}
        onAdjust={isAdmin ? setAdjustProductId : undefined}
      />
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
          employeeNames={employeeNames}
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
      {adjustRow && (
        <AdjustStockDialog
          open={true}
          inventoryId={adjustRow.inventory_id}
          productName={adjustRow.name}
          quantities={{
            in_stock: adjustRow.quantity_in_stock,
            in_use: adjustRow.quantity_in_use,
            damaged: adjustRow.quantity_damaged,
          }}
          onClose={() => setAdjustProductId(null)}
          onSaved={() => setAdjustProductId(null)}
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
