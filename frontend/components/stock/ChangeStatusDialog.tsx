"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { useToast } from "@/components/layout/ToastProvider";
import { useChangeEquipmentStatus } from "@/lib/stock/useChangeEquipmentStatus";
import { ApiError, extractErrorMessage } from "@/lib/api-client";
import type { EquipmentUnitStatus } from "@/lib/types";

const STATUS_OPTIONS: { value: EquipmentUnitStatus; label: string }[] = [
  { value: "in_stock", label: "In stock" },
  { value: "in_use", label: "In use" },
  { value: "under_repair", label: "Under repair" },
  { value: "damaged", label: "Damaged" },
  { value: "sold", label: "Sold" },
];

interface ChangeStatusDialogProps {
  open: boolean;
  unitId: number;
  currentStatus: EquipmentUnitStatus | "";
  onClose: () => void;
  onSaved: () => void;
}

export function ChangeStatusDialog({ open, unitId, currentStatus, onClose, onSaved }: ChangeStatusDialogProps) {
  const { show } = useToast();
  const changeStatus = useChangeEquipmentStatus();
  const [newStatus, setNewStatus] = useState<EquipmentUnitStatus>(
    currentStatus || "in_stock"
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNewStatus(currentStatus || "in_stock");
      setReason("");
      setError(null);
    }
  }, [open, unitId, currentStatus]);

  async function handleSubmit() {
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    setError(null);
    try {
      await changeStatus.mutateAsync({ unitId, new_status: newStatus, reason: reason.trim() });
      show("Status changed.", "success");
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
    <Dialog open={open} onClose={onClose} title="Change status">
      <div className="flex flex-col gap-3 min-w-[320px]">
        <div className="flex flex-col gap-1">
          <label className="block text-xs text-text/70">New status</label>
          <SegmentedToggle name="new-status" options={STATUS_OPTIONS} value={newStatus} onChange={(v) => setNewStatus(v as EquipmentUnitStatus)} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="change-status-reason" className="block text-xs text-text/70">
            Reason (required — goes to history)
          </label>
          <textarea
            id="change-status-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full min-h-16 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md"
          />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={changeStatus.isPending}>
            {changeStatus.isPending ? "Saving…" : "Save change"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
