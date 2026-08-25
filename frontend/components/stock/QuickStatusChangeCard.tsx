"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/layout/ToastProvider";
import { useChangeEquipmentStatus } from "@/lib/stock/useChangeEquipmentStatus";
import { ApiError, extractErrorMessage } from "@/lib/api-client";
import type { EquipmentUnit, EquipmentUnitStatus } from "@/lib/types";

const ALL_STATUSES: { value: EquipmentUnitStatus; label: string }[] = [
  { value: "in_stock", label: "In stock" },
  { value: "in_use", label: "In use" },
  { value: "under_repair", label: "Under repair" },
  { value: "damaged", label: "Damaged" },
  { value: "sold", label: "Sold" },
];

interface QuickStatusChangeCardProps {
  unit: EquipmentUnit;
  onSaved: () => void;
}

export function QuickStatusChangeCard({ unit, onSaved }: QuickStatusChangeCardProps) {
  const { show } = useToast();
  const changeStatus = useChangeEquipmentStatus();
  const [selectedStatus, setSelectedStatus] = useState<EquipmentUnitStatus | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const otherStatuses = ALL_STATUSES.filter((s) => s.value !== unit.status);

  async function handleSave() {
    if (!selectedStatus) {
      setError("Choose a status to move to.");
      return;
    }
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    setError(null);
    try {
      await changeStatus.mutateAsync({ unitId: unit.unit_id, new_status: selectedStatus, reason: reason.trim() });
      show("Status changed.", "success");
      setSelectedStatus(null);
      setReason("");
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(extractErrorMessage(err.body));
      } else {
        show("Something went wrong — try again.", "error");
      }
    }
  }

  return (
    <Card elevation="md">
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-sm">{unit.serial_number}</span>
        {unit.status && <Tag variant="neutral">{unit.status.replace(/_/g, " ")}</Tag>}
        {unit.storage_location && <span className="ml-auto text-sm text-text/50">{unit.storage_location}</span>}
      </div>
      <div className="flex flex-col gap-1">
        <label className="block text-xs text-text/70">Move to</label>
        <div className="grid grid-cols-2 gap-2">
          {otherStatuses.map((s) => (
            <Button
              key={s.value}
              type="button"
              variant={selectedStatus === s.value ? "primary" : "secondary"}
              className="min-h-11"
              onClick={() => setSelectedStatus(s.value)}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="quick-status-reason" className="block text-xs text-text/70">
          Reason (goes to history)
        </label>
        <input
          id="quick-status-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full min-h-11 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md"
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <Button block className="min-h-11" onClick={handleSave} disabled={changeStatus.isPending}>
        {changeStatus.isPending ? "Saving…" : "Save — writes audit row"}
      </Button>
    </Card>
  );
}
