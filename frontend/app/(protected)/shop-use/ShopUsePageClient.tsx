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
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import type { ConsumptionPurpose, EmployeeRole, Product, ShopAssetStatus } from "@/lib/types";

const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];
const SELECT_CLASS = "w-full min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md";

type Tab = "assets" | "consumption";

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

  return (
    <div>
      <PageHeader title="Shop use" subtitle="Stock the shop uses itself — never counted as an expense">
        <div className="ml-auto flex items-center gap-2">
          <SegmentedToggle
            name="shop-use-tab"
            options={[
              { value: "assets", label: "Assets" },
              { value: "consumption", label: "Consumption log" },
            ]}
            value={tab}
            onChange={(v) => setTab(v as Tab)}
          />
          {tab === "assets" && isManager && <Button onClick={() => setRegisterOpen(true)}>Register asset</Button>}
        </div>
      </PageHeader>

      {tab === "assets" ? (
        <>
          <Card elevation="sm" className="mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
          </Card>
          {assets.isError ? (
            <ErrorState message="Couldn't load shop assets." />
          ) : assets.isLoading ? (
            <p className="text-sm text-text/50">Loading assets…</p>
          ) : (
            <AssetCardGrid assets={visibleAssets} showValue={isManager} />
          )}
        </>
      ) : (
        <>
          <Card elevation="sm" className="mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
            <div className="flex items-center gap-3 mt-3">
              <span className="text-sm text-text/60">
                {consumptions.count} record{consumptions.count === 1 ? "" : "s"} · use &ldquo;Use in shop&rdquo; on a product to record more
              </span>
              <Button
                variant="secondary"
                className="ml-auto"
                disabled={consumptions.consumptions.length === 0}
                onClick={() => downloadCsv(consumptionsToCsv(consumptions.consumptions, isManager))}
              >
                Export CSV
              </Button>
            </div>
          </Card>
          {consumptions.isError ? (
            <ErrorState message="Couldn't load the consumption log." />
          ) : consumptions.isLoading ? (
            <p className="text-sm text-text/50">Loading…</p>
          ) : (
            <Card elevation="sm">
              <ConsumptionTable rows={consumptions.consumptions} showValue={isManager} />
            </Card>
          )}
        </>
      )}
      {registerOpen && <RegisterAssetDialog open onClose={() => setRegisterOpen(false)} />}
    </div>
  );
}
