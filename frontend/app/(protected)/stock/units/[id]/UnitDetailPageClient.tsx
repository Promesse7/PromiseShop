"use client";

import { useState } from "react";
import { useEquipmentUnitDetail } from "@/lib/stock/useEquipmentUnitDetail";
import { StatusHistoryTimeline } from "@/components/stock/StatusHistoryTimeline";
import { ChangeStatusDialog } from "@/components/stock/ChangeStatusDialog";
import { Page } from "@/components/ui/Page";
import { Card, CardKicker } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";

interface UnitDetailPageClientProps {
  unitId: number;
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-divider bg-surface px-3.5 py-2.5">
      <div className="text-xs text-text/50">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

export default function UnitDetailPageClient({ unitId }: UnitDetailPageClientProps) {
  const { unit, isLoading, isError } = useEquipmentUnitDetail(unitId);
  const [changeStatusOpen, setChangeStatusOpen] = useState(false);

  if (isError) {
    return (
      <Page title="Unit" back="/stock">
        <ErrorState message="Couldn't load this unit." />
      </Page>
    );
  }

  if (isLoading || !unit) {
    return <LoadingState variant="detail" label="Loading unit…" />;
  }

  const statusLabel = unit.status ? unit.status.replace(/_/g, " ") : "—";

  return (
    <Page
      title={`Unit ${unit.serial_number}`}
      description="Every status change this unit has been through"
      breadcrumb={[{ label: "Stock" }, { label: "Stock", href: "/stock" }, { label: unit.serial_number }]}
      back="/stock"
      primaryAction={<Button onClick={() => setChangeStatusOpen(true)}>Change status</Button>}
    >
      <div className="flex flex-col gap-4">
        <section aria-label="Unit details" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Fact label="Status" value={unit.status ? <Tag variant="neutral">{statusLabel}</Tag> : "—"} />
          <Fact label="Location" value={unit.storage_location ?? "—"} />
          <Fact label="Last changed" value={new Date(unit.status_changed_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} />
          <Fact label="Condition" value={unit.condition_notes ?? "—"} />
        </section>
        <Card elevation="sm">
          <CardKicker>History</CardKicker>
          <StatusHistoryTimeline entries={unit.status_history} />
        </Card>
      </div>
      <ChangeStatusDialog
        open={changeStatusOpen}
        unitId={unit.unit_id}
        currentStatus={unit.status}
        onClose={() => setChangeStatusOpen(false)}
        onSaved={() => setChangeStatusOpen(false)}
      />
    </Page>
  );
}
