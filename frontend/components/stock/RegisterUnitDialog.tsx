"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { LabelSheet } from "@/components/ui/LabelSheet";
import { UnitLabel } from "@/components/stock/UnitLabel";
import { useToast } from "@/components/layout/ToastProvider";
import { useRegisterUnit } from "@/lib/stock/useRegisterUnit";
import { ApiError, extractErrorMessage } from "@/lib/api-client";
import type { EquipmentUnit } from "@/lib/types";

interface RegisterUnitDialogProps {
  open: boolean;
  productId: number;
  productName: string;
  onClose: () => void;
  onSaved: () => void;
}

export function RegisterUnitDialog({ open, productId, productName, onClose, onSaved }: RegisterUnitDialogProps) {
  const { show } = useToast();
  const registerUnit = useRegisterUnit();
  const [serialNumber, setSerialNumber] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [conditionNotes, setConditionNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState<string | null>(null);
  const [savedUnit, setSavedUnit] = useState<EquipmentUnit | null>(null);

  // Reset the form when the dialog transitions to open (or opens for a different product) —
  // adjusting state during render, not in an effect, per the react-hooks set-state-in-effect rule.
  const openKey = open ? `${productId}` : null;
  if (openKey !== null && openKey !== resetKey) {
    setResetKey(openKey);
    setSerialNumber("");
    setStorageLocation("");
    setConditionNotes("");
    setError(null);
    setSavedUnit(null);
  } else if (openKey === null && resetKey !== null) {
    setResetKey(null);
  }

  async function handleSubmit() {
    if (!serialNumber.trim()) {
      setError("Serial number is required.");
      return;
    }
    setError(null);
    try {
      const unit = await registerUnit.mutateAsync({
        product: productId,
        serial_number: serialNumber.trim(),
        storage_location: storageLocation.trim() || null,
        condition_notes: conditionNotes.trim() || null,
      });
      show("Unit registered.", "success");
      setSavedUnit(unit);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(extractErrorMessage(err.body));
      } else {
        show("Something went wrong — try again.", "error");
      }
    }
  }

  if (savedUnit) {
    return (
      <Dialog open={open} onClose={onClose} title="Unit registered">
        <div className="flex flex-col gap-3 min-w-[320px]">
          <p className="text-sm">
            <span className="font-mono">{savedUnit.serial_number}</span> saved. Print a label for it now?
          </p>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="secondary" onClick={onClose}>
              Done
            </Button>
            <Button onClick={() => window.print()}>Print label now</Button>
          </div>
        </div>
        <LabelSheet>
          <UnitLabel productName={productName} serialNumber={savedUnit.serial_number} />
        </LabelSheet>
      </Dialog>
    );
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
