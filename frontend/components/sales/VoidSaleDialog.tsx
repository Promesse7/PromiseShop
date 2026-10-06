"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import type { Sale } from "@/lib/types";

interface VoidSaleDialogProps {
  open: boolean;
  sale: Sale;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (reason: string) => void;
  onClose: () => void;
}

/** Undo today's sale: every unit back in stock and every payment reversed. */
export function VoidSaleDialog({ open, sale, submitting, error, onSubmit, onClose }: VoidSaleDialogProps) {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit() {
    if (!reason.trim()) {
      setLocalError("Say why the sale is being voided.");
      return;
    }
    setLocalError(null);
    onSubmit(reason.trim());
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Void sale #S-${sale.sale_id}`}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text/70">
          Every item goes back on the shelf and every payment on this sale is reversed
          (RWF {Number(sale.amount_paid ?? 0).toLocaleString()} to hand back). This can&apos;t be undone.
        </p>
        <Field label="Reason" name="void-reason" value={reason} onChange={setReason} />
        {(localError || error) && <p className="text-xs text-red-600">{localError ?? error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Keep sale
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Voiding…" : "Void sale"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
