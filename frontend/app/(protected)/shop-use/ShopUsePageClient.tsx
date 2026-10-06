"use client";

import { useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAllPages } from "@/lib/api-client";
import { useConsumptions, useShopAssets, type ConsumptionFilters } from "@/lib/operations/useShopUse";
import { ASSET_STATUS_LABELS, PURPOSE_LABELS, consumptionsToCsv } from "@/lib/operations/labels";
import { AssetCardGrid } from "@/components/operations/AssetCardGrid";
import { ConsumptionTable } from "@/components/operations/ConsumptionTable";
import { RegisterAssetDialog } from "@/components/operations/RegisterAssetDialog";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Page, Toolbar } from "@/components/ui/Page";
import { Tabs } from "@/components/ui/Tabs";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import type { ConsumptionPurpose, EmployeeRole, Product, ShopAssetStatus } from "@/lib/types";

const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];
const SELECT_CLASS = "w-full min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md";

type Tab = "assets" | "consumption";

const TABS = [
  { id: "assets", label: "Assets" },
  { id: "consumption", label: "Consumption log" },
];

function downloadCsv(csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `shop-use-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface ShopUsePageClientProps {
  role: EmployeeRole;
}

export default function ShopUsePageClient({ role }: ShopUsePageClientProps) {
  const isManager = ADMIN_ROLES.includes(role);
  const [tab, setTab] = useState<Tab>("assets");
  const [status, setStatus] = useState<ShopAssetStatus | "">("");
  const [location, setLocation] = useState("");
  const [assignee, setAssignee] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [filters, setFilters] = useState<ConsumptionFilters>({ from: "", to: "", product: null, purpose: "", taken_by: null });
  const statusId = useId();
  const productId = useId();
  const purposeId = useId();
  const assigneeId = useId();

  const assets = useShopAssets({ status, location: location.trim() }, tab === "assets");
  const consumptions = useConsumptions(filters, tab === "consumption");
  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => fetchAllPages<Product>("products/"),
    enabled: tab === "consumption",
  });
  const sortedProducts = useMemo(
    () => [...(products.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [products.data]
  );
  // People who appear on assets / in the log — staff can't list employees, so derive from the rows.
  const assignees = useMemo(() => {
    const seen = new Map<number, string>();
    for (const a of assets.assets) if (a.assigned_to && a.assigned_to_name) seen.set(a.assigned_to, a.assigned_to_name);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [assets.assets]);
  const takers = useMemo(() => {
    const seen = new Map<number, string>();
    for (const c of consumptions.consumptions) if (c.taken_by_name) seen.set(c.taken_by, c.taken_by_name);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [consumptions.consumptions]);
  const visibleAssets = assignee ? assets.assets.filter((a) => String(a.assigned_to) === assignee) : assets.assets;

  function setFilter<K extends keyof ConsumptionFilters>(key: K, value: ConsumptionFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const assetsPanel = (
    <div className="flex flex-col gap-4">
      <Toolbar
        activeFilterCount={[status, location.trim(), assignee].filter(Boolean).length}
        filters={
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={statusId} className="block text-xs text-text/70">Status</label>
              <select id={statusId} value={status} onChange={(e) => setStatus(e.target.value as ShopAssetStatus | "")} className={SELECT_CLASS}>
                <option value="">All statuses</option>
                {(Object.keys(ASSET_STATUS_LABELS) as ShopAssetStatus[]).map((s) => (
                  <option key={s} value={s}>{ASSET_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <Field label="Location" name="location" value={location} onChange={setLocation} placeholder="Any" />
            <div className="flex flex-col gap-1">
              <label htmlFor={assigneeId} className="block text-xs text-text/70">Assigned to</label>
              <select id={assigneeId} value={assignee} onChange={(e) => setAssignee(e.target.value)} className={SELECT_CLASS}>
                <option value="">Anyone</option>
                {assignees.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
          </div>
        }
      />
      {assets.isError ? (
        <ErrorState message="Couldn't load shop assets." />
      ) : assets.isLoading ? (
        <LoadingState variant="cards" label="Loading assets…" />
      ) : (
        <AssetCardGrid assets={visibleAssets} showValue={isManager} />
      )}
    </div>
  );

  const consumptionPanel = (
    <div className="flex flex-col gap-4">
      <Toolbar
        activeFilterCount={[filters.from, filters.to, filters.product, filters.purpose, filters.taken_by].filter(Boolean).length}
        filters={
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="From" name="from" type="date" value={filters.from ?? ""} onChange={(v) => setFilter("from", v)} />
            <Field label="To" name="to" type="date" value={filters.to ?? ""} onChange={(v) => setFilter("to", v)} />
            <div className="flex flex-col gap-1">
              <label htmlFor={productId} className="block text-xs text-text/70">Product</label>
              <select id={productId} value={filters.product ?? ""} onChange={(e) => setFilter("product", e.target.value ? Number(e.target.value) : null)} className={SELECT_CLASS}>
                <option value="">All products</option>
                {sortedProducts.map((p) => <option key={p.product_id} value={p.product_id}>{p.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={purposeId} className="block text-xs text-text/70">Purpose</label>
              <select id={purposeId} value={filters.purpose ?? ""} onChange={(e) => setFilter("purpose", e.target.value as ConsumptionPurpose | "")} className={SELECT_CLASS}>
                <option value="">All purposes</option>
                {(Object.keys(PURPOSE_LABELS) as ConsumptionPurpose[]).map((p) => (
                  <option key={p} value={p}>{PURPOSE_LABELS[p]}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${purposeId}-taker`} className="block text-xs text-text/70">Taken by</label>
              <select id={`${purposeId}-taker`} value={filters.taken_by ?? ""} onChange={(e) => setFilter("taken_by", e.target.value ? Number(e.target.value) : null)} className={SELECT_CLASS}>
                <option value="">Anyone</option>
                {takers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
          </div>
        }
        trailing={
          <Button
            variant="secondary"
            disabled={consumptions.consumptions.length === 0}
            onClick={() => downloadCsv(consumptionsToCsv(consumptions.consumptions, isManager))}
          >
            Export CSV
          </Button>
        }
      />
      <p className="m-0 text-sm text-text/60">
        {consumptions.count} record{consumptions.count === 1 ? "" : "s"} · use &ldquo;Use in shop&rdquo; on a product to record more
      </p>
      {consumptions.isError ? (
        <ErrorState message="Couldn't load the consumption log." />
      ) : consumptions.isLoading ? (
        <LoadingState variant="table" label="Loading the consumption log…" />
      ) : (
        <ConsumptionTable rows={consumptions.consumptions} showValue={isManager} />
      )}
    </div>
  );

  return (
    <Page
      title="Shop use"
      description="Stock the shop uses itself — never counted as an expense"
      primaryAction={
        tab === "assets" && isManager ? <Button onClick={() => setRegisterOpen(true)}>Register asset</Button> : undefined
      }
    >
      <Tabs tabs={TABS} value={tab} onChange={(id) => setTab(id as Tab)} label="Shop use sections">
        {(active) => (active === "assets" ? assetsPanel : consumptionPanel)}
      </Tabs>
      {registerOpen && <RegisterAssetDialog open onClose={() => setRegisterOpen(false)} />}
    </Page>
  );
}
