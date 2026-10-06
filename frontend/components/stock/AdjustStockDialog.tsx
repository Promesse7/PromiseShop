"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { useToast } from "@/components/layout/ToastProvider";
import { useAdjustInventory } from "@/lib/stock/useAdjustInventory";
import { ApiError, extractErrorMessage } from "@/lib/api-client";
import type { InventoryAdjustmentType } from "@/lib/types";

const TYPE_OPTIONS: { value: InventoryAdjustmentType; label: string }[] = [
  { value: "count_correction", label: "Count correction" },
  { value: "to_damaged", label: "To damaged" },
  { value: "from_damaged", label: "From damaged" },
  { value: "to_in_use", label: "To in use" },
  { value: "from_in_use", label: "From in use" },
];

interface AdjustStockDialogProps {
  open: boolean;
  inventoryId: number;
  productName: string;
  quantities: { in_stock: number; in_use: number; damaged: number };
  onClose: () => void;
  onSaved: () => void;
}

export function AdjustStockDialog({ open, inventoryId, productName, quantities, onClose, onSaved }: AdjustStockDialogProps) {
  const { show } = useToast();
  const adjust = useAdjustInventory();
  const [type, setType] = useState<InventoryAdjustmentType>("count_correction");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState<string | null>(null);

  // Reset the form when the dialog opens (or opens for a different row) — state
  // adjusted during render, not in an effect, per the react-hooks set-state-in-effect rule.
  const openKey = open ? String(inventoryId) : null;
  if (openKey !== null && openKey !== resetKey) {
    setResetKey(openKey);
    setType("count_correction");
    setQuantity("");
    setReason("");
    setError(null);
  } else if (openKey === null && resetKey !== null) {
    setResetKey(null);
  }

  const isCount = type === "count_correction";

  async function handleSubmit() {
    const parsed = Number(quantity);
    if (quantity.trim() === "" || !Number.isFinite(parsed) || parsed < 0 || (!isCount && parsed < 1)) {
      setError("Enter a quantity.");
      return;
    }
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    setError(null);
    try {
      await adjust.mutateAsync({ inventoryId, adjustment_type: type, quantity: parsed, reason: reason.trim() });
      show("Stock adjusted.", "success");
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
    <Dialog open={open} onClose={onClose} title={`Adjust stock — ${productName}`}>
      <div className="flex flex-col gap-3 sm:min-w-[360px]">
        <p className="text-sm text-text/70">
          {quantities.in_stock} in stock · {quantities.in_use} in use · {quantities.damaged} damaged
        </p>
        <div className="flex flex-col gap-1">
          <label className="block text-xs text-text/70">Adjustment</label>
          <SegmentedToggle
            name="adjustment-type"
            options={TYPE_OPTIONS}
            value={type}
            onChange={(v) => setType(v as InventoryAdjustmentType)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="adjust-stock-quantity" className="block text-xs text-text/70">
            {isCount ? "New count in stock" : "Quantity"}
          </label>
          <input
            id="adjust-stock-quantity"
            type="number"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-32 min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="adjust-stock-reason" className="block text-xs text-text/70">
            Reason (required — goes to history)
          </label>
          <textarea
            id="adjust-stock-reason"
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
          <Button onClick={handleSubmit} disabled={adjust.isPending}>
            {adjust.isPending ? "Saving…" : "Save adjustment"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
