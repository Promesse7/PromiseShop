"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/layout/ToastProvider";
import { useRegisterUnit } from "@/lib/stock/useRegisterUnit";
import { ApiError, extractErrorMessage } from "@/lib/api-client";

interface RegisterUnitDialogProps {
  open: boolean;
  productId: number;
  onClose: () => void;
  onSaved: () => void;
}

export function RegisterUnitDialog({ open, productId, onClose, onSaved }: RegisterUnitDialogProps) {
  const { show } = useToast();
  const registerUnit = useRegisterUnit();
  const [serialNumber, setSerialNumber] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [conditionNotes, setConditionNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSerialNumber("");
      setStorageLocation("");
      setConditionNotes("");
      setError(null);
    }
  }, [open, productId]);

  async function handleSubmit() {
    if (!serialNumber.trim()) {
      setError("Serial number is required.");
      return;
    }
    setError(null);
    try {
      await registerUnit.mutateAsync({
        product: productId,
        serial_number: serialNumber.trim(),
        storage_location: storageLocation.trim() || null,
        condition_notes: conditionNotes.trim() || null,
      });
      show("Unit registered.", "success");
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
    <Dialog open={open} onClose={onClose} title="Register unit">
      <div className="flex flex-col gap-3 min-w-[320px]">
        <Field label="Serial number" name="serial_number" value={serialNumber} onChange={setSerialNumber} />
        <Field label="Storage location" name="storage_location" value={storageLocation} onChange={setStorageLocation} />
        <Field label="Condition notes" name="condition_notes" value={conditionNotes} onChange={setConditionNotes} />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={registerUnit.isPending}>
            {registerUnit.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
