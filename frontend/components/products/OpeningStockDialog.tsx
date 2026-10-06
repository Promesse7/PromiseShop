"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/layout/ToastProvider";
import { useSetOpeningStock } from "@/lib/products/useOpeningStock";
import { ApiError, extractErrorMessage } from "@/lib/api-client";

interface OpeningStockDialogProps {
  open: boolean;
  productId: number;
  productName: string;
  currentInStock: number;
  onClose: () => void;
  onSaved: () => void;
}

/** Admin: the opening count of a product the shop already had before using the system. */
export function OpeningStockDialog({ open, productId, productName, currentInStock, onClose, onSaved }: OpeningStockDialogProps) {
  const { show } = useToast();
  const save = useSetOpeningStock(productId);
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(false);

  // Reset when the dialog opens (state adjusted during render, per react-hooks rules).
  if (open && !wasOpen) {
    setWasOpen(true);
    setQuantity("");
    setUnitCost("");
    setReason("");
    setError(null);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  async function handleSubmit() {
    const qty = Number(quantity);
    if (quantity.trim() === "" || !Number.isInteger(qty) || qty < 1) {
      setError("Enter the opening count — a whole number of at least 1.");
      return;
    }
    if (qty <= currentInStock) {
      setError(`There are already ${currentInStock} in stock — enter a higher count, or use Adjust stock to lower it.`);
      return;
    }
    const cost = Number(unitCost);
    if (unitCost.trim() === "" || !Number.isFinite(cost) || cost < 0) {
      setError("Enter what one unit cost the shop.");
      return;
    }
    setError(null);
    try {
      await save.mutateAsync({ quantity: qty, unit_cost: unitCost.trim(), reason: reason.trim() });
      show("Opening stock set.", "success");
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
    <Dialog open={open} onClose={onClose} title={`Set opening stock — ${productName}`}>
      <div className="flex flex-col gap-3 min-w-[340px]">
        <p className="text-sm text-text/70">
          For stock the shop already had before using PromiseShop. It counts toward the product&apos;s average cost.
          {currentInStock > 0 && ` ${currentInStock} are already recorded in stock; only the difference is added.`}
        </p>
        <div className="flex flex-col gap-1">
          <label htmlFor="opening-qty" className="text-xs text-text/70">Opening count in stock</label>
          <input id="opening-qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)}
            className="min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="opening-cost" className="text-xs text-text/70">Cost per unit (RWF)</label>
          <input id="opening-cost" inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)}
            className="min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="opening-reason" className="text-xs text-text/70">Note (optional)</label>
          <input id="opening-reason" value={reason} onChange={(e) => setReason(e.target.value)}
            className="min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md" />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={save.isPending}>{save.isPending ? "Saving…" : "Set opening stock"}</Button>
        </div>
      </div>
    </Dialog>
  );
}
