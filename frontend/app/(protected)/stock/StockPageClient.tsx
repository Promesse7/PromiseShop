"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeftRight, ScanLine } from "lucide-react";
import { useStockOverview } from "@/lib/stock/useStockOverview";
import { useEquipmentUnits } from "@/lib/stock/useEquipmentUnits";
import { useEmployees } from "@/lib/employees/useEmployees";
import { StockOverviewCardGrid } from "@/components/stock/StockOverviewCardGrid";
import { SerializedUnitsTable } from "@/components/stock/SerializedUnitsTable";
import { RegisterUnitDialog } from "@/components/stock/RegisterUnitDialog";
import { AdjustStockDialog } from "@/components/stock/AdjustStockDialog";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Button } from "@/components/ui/Button";
import { Page, Toolbar } from "@/components/ui/Page";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { LabelSheet } from "@/components/ui/LabelSheet";
import { UnitLabel } from "@/components/stock/UnitLabel";
import { DURATION, EASE, useReducedMotionSafe } from "@/lib/motion";
import type { EmployeeRole, EquipmentUnit } from "@/lib/types";

type StockFilter = "all" | "low_out" | "serialized";

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "low_out", label: "Low / out" },
  { value: "serialized", label: "Serialized only" },
];

const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];

const LINK_BUTTON =
  "inline-flex items-center gap-1.5 rounded-md border border-divider bg-surface px-2.5 py-1.5 text-sm text-text no-underline hover:border-accent/40 hover:text-accent";

interface StockPageClientProps {
  role?: EmployeeRole;
}

export default function StockPageClient({ role }: StockPageClientProps) {
  const overview = useStockOverview();
  const searchParams = useSearchParams();
  const reduced = useReducedMotionSafe();
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

  const toolbar = (
    <Toolbar
      search={
        <input
          aria-label="Search stock"
          placeholder="Search product or location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-9 w-full rounded-md border border-divider bg-surface px-2.5 py-1.5 text-sm text-text"
        />
      }
      activeFilterCount={filter !== "all" ? 1 : 0}
      filters={
        <SegmentedToggle name="stk" options={FILTER_OPTIONS} value={filter} onChange={(v) => setFilter(v as StockFilter)} />
      }
      trailing={
        <>
          <Link href="/stock/movements" className={LINK_BUTTON}>
            <ArrowLeftRight className="h-4 w-4" aria-hidden />
            Movements
          </Link>
          <Link href="/stock/scan" className={LINK_BUTTON} aria-label="Quick status change">
            <ScanLine className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Quick status change</span>
          </Link>
        </>
      }
    />
  );

  let grid;
  if (overview.isError) grid = <ErrorState message="Couldn't load stock." />;
  else if (overview.isLoading) grid = <LoadingState variant="cards" label="Loading stock…" />;
  else
    grid = (
      <StockOverviewCardGrid
        rows={filteredRows}
        onSelectProduct={handleSelectProduct}
        onAdjust={isAdmin ? setAdjustProductId : undefined}
        selectedProductId={selectedProductId}
      />
    );

  const unitsBar =
    selectedUnitIds.size > 0 ? (
      <motion.div
        key="units-bar"
        className="mb-3 flex items-center gap-2 rounded-md bg-accent/10 p-2 text-sm"
        initial={reduced ? false : { opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0, transition: { duration: DURATION.fast, ease: EASE.out } }}
        exit={reduced ? undefined : { opacity: 0, transition: { duration: DURATION.fast } }}
      >
        <span>{selectedUnitIds.size} selected</span>
        <Button
          variant="secondary"
          className="ml-auto"
          onClick={() => setPrintQueue(selectedProductUnits.units.filter((u) => selectedUnitIds.has(u.unit_id)))}
        >
          Print {selectedUnitIds.size} labels
        </Button>
      </motion.div>
    ) : null;

  return (
    <Page title="Stock" description="What's on the shelf, in use and damaged, product by product" toolbar={toolbar}>
      <div className="flex flex-col gap-6">
        {grid}
        <section aria-labelledby="units-heading" className="flex flex-col gap-2">
          <div className="flex items-baseline gap-3">
            <h2 id="units-heading" className="m-0 text-base font-medium">
              {selectedProduct ? `Serialized units — ${selectedProduct.name}` : "Serialized units"}
            </h2>
            {selectedProduct && (
              <Button variant="ghost" className="ml-auto" onClick={() => setRegisterOpen(true)}>
                + Register unit
              </Button>
            )}
          </div>
          {reduced ? unitsBar : <AnimatePresence>{unitsBar}</AnimatePresence>}
          {selectedProduct ? (
            <SerializedUnitsTable
              units={selectedProductUnits.units}
              selectedIds={selectedUnitIds}
              onToggleSelect={toggleSelectUnit}
              onPrintLabel={(unit) => setPrintQueue([unit])}
              employeeNames={employeeNames}
            />
          ) : (
            <EmptyState title="Select a product above to view its serialized units" />
          )}
        </section>
      </div>
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
    </Page>
  );
}
