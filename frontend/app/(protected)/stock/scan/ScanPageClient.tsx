"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { fetchAllPages } from "@/lib/api-client";
import { QuickStatusChangeCard } from "@/components/stock/QuickStatusChangeCard";
import type { EquipmentUnit } from "@/lib/types";

export default function ScanPageClient() {
  const [search, setSearch] = useState("");
  const unitsQuery = useQuery({
    queryKey: ["equipment-units"],
    queryFn: () => fetchAllPages<EquipmentUnit>("equipment-units/"),
  });

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
