"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ScanLine } from "lucide-react";
import { fetchAllPages } from "@/lib/api-client";
import { useShopAssets } from "@/lib/operations/useShopUse";
import { QuickStatusChangeCard } from "@/components/stock/QuickStatusChangeCard";
import { Page } from "@/components/ui/Page";
import { EmptyState } from "@/components/ui/EmptyState";
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
    <Page
      title="Quick status change"
      description="Scan or type a serial number, then move the unit in one tap"
      breadcrumb={[{ label: "Stock" }, { label: "Stock", href: "/stock" }, { label: "Quick status change" }]}
      back="/stock"
    >
      <div className="flex max-w-2xl flex-col gap-3">
        <input
          aria-label="Scan serial or search unit…"
          placeholder="Scan serial or search unit…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          // A scanner types into whatever has focus, so the box is ready on arrival.
          autoFocus
          className="min-h-11 w-full rounded-md border border-divider bg-surface px-3 py-1.5 text-base text-text"
        />
        {match ? (
          <QuickStatusChangeCard key={match.unit_id} unit={match} onSaved={() => setSearch("")} />
        ) : (
          <EmptyState
            icon={ScanLine}
            title={search.trim() ? "No unit matches that serial" : "Ready to scan"}
            message={search.trim() ? "Check the serial, or register the unit from Stock." : "Point the scanner at a unit's label."}
          />
        )}
      </div>
    </Page>
  );
}
