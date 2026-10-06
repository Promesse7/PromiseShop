"use client";

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
import { ErrorState } from "@/components/ui/ErrorState";
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

  if (isError) return <ErrorState message="Couldn't load this asset." />;
  if (isLoading || !asset) return <p className="text-sm text-text/50">Loading asset…</p>;

  const closed = asset.status === "retired" || asset.status === "returned_to_stock";
  const statusChoices = isManager
    ? MANAGER_STATUSES
    : role === "technician" && TECHNICIAN_STATUSES.includes(asset.status)
      ? TECHNICIAN_STATUSES
      : [];

  return (
    <div>
      <Link href="/shop-use" className="text-sm text-accent">← Shop use</Link>
      <div className="flex flex-wrap items-center gap-3 my-4">
        <h3 className="m-0">{asset.name}</h3>
        <Tag variant={ASSET_STATUS_TAG[asset.status]}>{ASSET_STATUS_LABELS[asset.status]}</Tag>
        {asset.is_spare && <Tag variant="outline">Spare</Tag>}
        {asset.serial && <span className="font-mono text-xs text-text/50">{asset.serial}</span>}
        {!closed && (
          <div className="ml-auto flex gap-2">
            <Button onClick={() => setDialog("replace")}>Report broken / Replace</Button>
            {statusChoices.length > 0 && (
              <Button variant="secondary" onClick={() => setDialog("status")}>Change status</Button>
            )}
            {role === "admin" && asset.product !== null && (
              <Button variant="secondary" onClick={() => setDialog("return")}>Return to stock</Button>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4">
        <Card elevation="sm">
          <CardKicker>Details</CardKicker>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-text/60">Product</dt>
            <dd>
              {asset.product ? (
                <Link href={`/products/${asset.product}`} className="text-accent">{asset.product_name}</Link>
              ) : (
                "—"
              )}
            </dd>
            <dt className="text-text/60">Location</dt>
            <dd>{asset.location || "—"}</dd>
            <dt className="text-text/60">Assigned to</dt>
            <dd>{asset.assigned_to_name ?? "—"}</dd>
            <dt className="text-text/60">Source</dt>
            <dd>{asset.source === "from_stock" ? "Taken from stock" : "Already owned"}</dd>
            <dt className="text-text/60">Since</dt>
            <dd>{asset.acquired_at}</dd>
            {isManager && (
              <>
                <dt className="text-text/60">Value</dt>
                <dd>{formatValue(asset.acquisition_value)}</dd>
              </>
            )}
            {asset.replaces && (
              <>
                <dt className="text-text/60">Replaced</dt>
                <dd>
                  <Link href={`/shop-use/assets/${asset.replaces}`} className="text-accent">{asset.replaces_name}</Link>
                </dd>
              </>
            )}
            {asset.notes && (
              <>
                <dt className="text-text/60">Notes</dt>
                <dd>{asset.notes}</dd>
              </>
            )}
          </dl>
        </Card>
        <Card elevation="sm">
          <CardKicker>History</CardKicker>
          <AssetTimeline events={events} />
        </Card>
      </div>
      <Card elevation="sm" className="mt-4">
        <CardKicker>Parts used on it</CardKicker>
        <ConsumptionTable rows={parts.consumptions} showValue={isManager} />
      </Card>
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
    </div>
  );
}
