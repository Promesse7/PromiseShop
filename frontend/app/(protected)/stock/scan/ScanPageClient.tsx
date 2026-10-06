"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchAllPages } from "@/lib/api-client";
import { useShopAssets } from "@/lib/operations/useShopUse";
import { QuickStatusChangeCard } from "@/components/stock/QuickStatusChangeCard";
import type { EquipmentUnit } from "@/lib/types";

export default function ScanPageClient() {
  const [search, setSearch] = useState("");
  const unitsQuery = useQuery({
    queryKey: ["equipment-units"],
    queryFn: () => fetchAllPages<EquipmentUnit>("equipment-units/"),
  });

  // A serial that belongs to one of the shop's own assets opens that asset (exact match only).
  const router = useRouter();
  const serial = search.trim();
  const shopAsset = useShopAssets({ serial }, serial.length >= 3);
  const assetId = shopAsset.assets[0]?.asset_id;
  useEffect(() => {
    if (assetId) router.push(`/shop-use/assets/${assetId}`);
  }, [assetId, router]);

  const match = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !unitsQuery.data) return undefined;
    return unitsQuery.data.find((u) => u.serial_number.toLowerCase().includes(q));
  }, [unitsQuery.data, search]);

  return (
    <div>
      <Link href="/stock" className="text-sm">
        ← Stock
      </Link>
      <h4 className="mt-2 mb-3">Quick status change</h4>
      <div className="flex gap-2 mb-3">
        <input
          aria-label="Scan serial or search unit…"
          placeholder="Scan serial or search unit…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-11 flex-1 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md"
        />
      </div>
      {match && (
        <QuickStatusChangeCard
          key={match.unit_id}
          unit={match}
          onSaved={() => setSearch("")}
        />
      )}
    </div>
  );
}
