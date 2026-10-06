import Link from "next/link";
import { Card, CardMeta, CardTitle } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { ASSET_STATUS_LABELS, ASSET_STATUS_TAG, formatValue } from "@/lib/operations/labels";
import type { ShopAsset } from "@/lib/types";

interface AssetCardGridProps {
  assets: ShopAsset[];
  showValue: boolean;
}

export function AssetCardGrid({ assets, showValue }: AssetCardGridProps) {
  if (assets.length === 0) {
    return <p className="text-sm text-text/50">No shop assets match these filters</p>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {assets.map((a) => (
        <Card key={a.asset_id} elevation="sm" className="h-full">
          <div className="flex items-center gap-2">
            <Tag variant={ASSET_STATUS_TAG[a.status]}>{ASSET_STATUS_LABELS[a.status]}</Tag>
            {a.is_spare && <Tag variant="outline">Spare</Tag>}
          </div>
          <CardTitle>{a.name}</CardTitle>
          {a.serial && <CardMeta>Serial {a.serial}</CardMeta>}
          <div className="flex flex-col gap-0.5 text-sm text-text/70">
            <span>{a.location || "No location"}</span>
            <span>{a.assigned_to_name ? `With ${a.assigned_to_name}` : "Not assigned"}</span>
            <span>{a.source === "from_stock" ? "Taken from stock" : "Already owned"}</span>
            {showValue && "acquisition_value" in a && <span>{formatValue(a.acquisition_value)}</span>}
          </div>
          <Link href={`/shop-use/assets/${a.asset_id}`} className="mt-auto text-sm text-accent">
            Open →
          </Link>
        </Card>
      ))}
    </div>
  );
}
