"use client";

import { sharedName } from "@/components/ui/SharedElement";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConsumptions, useShopAsset } from "@/lib/operations/useShopUse";
import { ASSET_STATUS_LABELS, ASSET_STATUS_TAG, formatValue } from "@/lib/operations/labels";
import { AssetTimeline } from "@/components/operations/AssetTimeline";
import { AssetActionDialog } from "@/components/operations/AssetActionDialog";
import { ConsumptionTable } from "@/components/operations/ConsumptionTable";
import { ReplaceAssetWizard } from "@/components/operations/ReplaceAssetWizard";
import { Button } from "@/components/ui/Button";
import { Card, CardKicker } from "@/components/ui/Card";
import { Page } from "@/components/ui/Page";
import { StatStrip } from "@/components/finance/StatStrip";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Tag } from "@/components/ui/Tag";
import type { EmployeeRole, ShopAssetStatus } from "@/lib/types";

const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];
const MANAGER_STATUSES: ShopAssetStatus[] = ["in_service", "under_repair", "damaged", "retired"];
// A technician may only move an asset between repair and service (with a manager's PIN).
const TECHNICIAN_STATUSES: ShopAssetStatus[] = ["in_service", "under_repair"];

interface AssetDetailPageClientProps {
  assetId: number;
  role: EmployeeRole;
}

export default function AssetDetailPageClient({ assetId, role }: AssetDetailPageClientProps) {
  const { asset, events, isLoading, isError } = useShopAsset(assetId);
  const parts = useConsumptions({ shop_asset: assetId });
  const [dialog, setDialog] = useState<"replace" | "status" | "return" | null>(null);
  const router = useRouter();
  const isManager = ADMIN_ROLES.includes(role);

  if (isError) {
    return (
      <Page title="Shop asset" back="/shop-use">
        <ErrorState message="Couldn't load this asset." />
      </Page>
    );
  }
  if (isLoading || !asset) return <LoadingState variant="detail" label="Loading asset…" />;

  const closed = asset.status === "retired" || asset.status === "returned_to_stock";
  const statusChoices = isManager
    ? MANAGER_STATUSES
    : role === "technician" && TECHNICIAN_STATUSES.includes(asset.status)
      ? TECHNICIAN_STATUSES
      : [];

  const actions = !closed ? (
    <div className="flex flex-wrap items-center gap-2">
      {statusChoices.length > 0 && (
        <Button variant="secondary" onClick={() => setDialog("status")}>Change status</Button>
      )}
      {role === "admin" && asset.product !== null && (
        <Button variant="secondary" onClick={() => setDialog("return")}>Return to stock</Button>
      )}
      <Button onClick={() => setDialog("replace")}>Report broken / Replace</Button>
    </div>
  ) : undefined;

  return (
    <Page
      title={asset.name}
      sharedName={sharedName("asset", asset.asset_id)}
      breadcrumb={[{ label: "Stock" }, { label: "Shop use", href: "/shop-use" }, { label: asset.name }]}
      back="/shop-use"
      primaryAction={actions}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Tag variant={ASSET_STATUS_TAG[asset.status]}>{ASSET_STATUS_LABELS[asset.status]}</Tag>
          {asset.is_spare && <Tag variant="outline">Spare</Tag>}
          {asset.serial && <span className="font-mono text-xs text-text/50">{asset.serial}</span>}
        </div>

        <StatStrip
          label="Asset facts"
          stats={[
            { label: "Location", value: asset.location || "—" },
            { label: "Assigned to", value: asset.assigned_to_name ?? "—" },
            { label: "Since", value: asset.acquired_at },
            isManager
              ? { label: "Value", value: formatValue(asset.acquisition_value) }
              : { label: "Source", value: asset.source === "from_stock" ? "Taken from stock" : "Already owned" },
          ]}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card elevation="sm">
            <CardKicker>History</CardKicker>
            <AssetTimeline events={events} />
          </Card>
          <Card elevation="sm">
            <CardKicker>Details</CardKicker>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-text/60">Product</dt>
              <dd className="m-0">
                {asset.product ? (
                  <Link href={`/products/${asset.product}`} className="text-accent">{asset.product_name}</Link>
                ) : (
                  "—"
                )}
              </dd>
              <dt className="text-text/60">Source</dt>
              <dd className="m-0">{asset.source === "from_stock" ? "Taken from stock" : "Already owned"}</dd>
              {asset.replaces && (
                <>
                  <dt className="text-text/60">Replaced</dt>
                  <dd className="m-0">
                    <Link href={`/shop-use/assets/${asset.replaces}`} className="text-accent">{asset.replaces_name}</Link>
                  </dd>
                </>
              )}
              {asset.notes && (
                <>
                  <dt className="text-text/60">Notes</dt>
                  <dd className="m-0">{asset.notes}</dd>
                </>
              )}
            </dl>
          </Card>
        </div>

        <section aria-labelledby="parts-heading" className="flex flex-col gap-2">
          <h2 id="parts-heading" className="m-0 text-base font-medium">Parts used on it</h2>
          <ConsumptionTable rows={parts.consumptions} showValue={isManager} emptyMessage="No parts used on it yet" />
        </section>
      </div>
      {dialog === "replace" && (
        <ReplaceAssetWizard
          open
          asset={asset}
          onClose={() => setDialog(null)}
          onDone={(newId) => {
            setDialog(null);
            if (newId !== null && newId !== asset.asset_id) router.push(`/shop-use/assets/${newId}`);
          }}
        />
      )}
      {dialog === "status" && (
        <AssetActionDialog open asset={asset} mode="status" statuses={statusChoices} onClose={() => setDialog(null)} />
      )}
      {dialog === "return" && <AssetActionDialog open asset={asset} mode="return" onClose={() => setDialog(null)} />}
    </Page>
  );
}
