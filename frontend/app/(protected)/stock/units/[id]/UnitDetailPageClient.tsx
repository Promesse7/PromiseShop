"use client";

import { useState } from "react";
import Link from "next/link";
import { useEquipmentUnitDetail } from "@/lib/stock/useEquipmentUnitDetail";
import { StatusHistoryTimeline } from "@/components/stock/StatusHistoryTimeline";
import { ChangeStatusDialog } from "@/components/stock/ChangeStatusDialog";
import { Tag } from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";

interface UnitDetailPageClientProps {
  unitId: number;
}

export default function UnitDetailPageClient({ unitId }: UnitDetailPageClientProps) {
  const { unit, isLoading, isError } = useEquipmentUnitDetail(unitId);
  const [changeStatusOpen, setChangeStatusOpen] = useState(false);

  if (isError) {
    return (
      <ErrorState message="Couldn't load this unit." />
    );
  }

  if (isLoading || !unit) {
    return <p className="text-sm text-text/50">Loading unit…</p>;
  }

  return (
    <div className="grid grid-cols-[1fr_320px] gap-6">
      <div>
        <Link href="/stock" className="text-sm">
          ← Stock
        </Link>
        <div className="flex items-center gap-2 my-2">
          <h4 className="m-0">Unit {unit.serial_number}</h4>
          {unit.status && <Tag variant="neutral">{unit.status.replace(/_/g, " ")}</Tag>}
        </div>
        <StatusHistoryTimeline entries={unit.status_history} />
      </div>
      <div>
        <Button onClick={() => setChangeStatusOpen(true)}>Change status</Button>
      </div>
      <ChangeStatusDialog
        open={changeStatusOpen}
        unitId={unit.unit_id}
        currentStatus={unit.status}
        onClose={() => setChangeStatusOpen(false)}
        onSaved={() => setChangeStatusOpen(false)}
      />
    </div>
  );
}
