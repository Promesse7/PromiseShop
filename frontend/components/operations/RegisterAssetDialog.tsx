"use client";

import { useId, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/layout/ToastProvider";
import { ApiError, extractErrorMessage } from "@/lib/api-client";
import { useRegisterAsset } from "@/lib/operations/useShopUse";

interface RegisterAssetDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Equipment the shop already owned before the system (admin/manager); no stock moves. */
export function RegisterAssetDialog({ open, onClose }: RegisterAssetDialogProps) {
  const [name, setName] = useState("");
  const [serial, setSerial] = useState("");
  const [location, setLocation] = useState("");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [isSpare, setIsSpare] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const spareId = useId();
  const register = useRegisterAsset();
  const { show } = useToast();

  async function save() {
    setError(null);
    try {
      await register.mutateAsync({
        name: name.trim(), serial: serial.trim() || undefined, location: location.trim(),
        acquisition_value: value.trim() || null, notes: notes.trim(), is_spare: isSpare,
        reason: "Registered as already owned",
      });
      show(`${name.trim()} registered.`, "success");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? extractErrorMessage(err.body) : "Something went wrong — try again.");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Register shop asset">
      <div className="flex flex-col gap-3 min-w-[320px]">
        <p className="text-xs text-text/60">Something the shop already owns (its printer, a laptop). Stock is not touched.</p>
        <Field label="Name" name="name" value={name} onChange={setName} />
        <Field label="Serial (optional)" name="serial" value={serial} onChange={setSerial} />
        <Field label="Location" name="location" value={location} onChange={setLocation} />
        <Field label="Estimated value (optional)" name="value" type="number" value={value} onChange={setValue} />
        <Field label="Notes" name="notes" value={notes} onChange={setNotes} />
        <label htmlFor={spareId} className="flex items-center gap-2 text-sm text-text/80">
          <input id={spareId} type="checkbox" checked={isSpare} onChange={(e) => setIsSpare(e.target.checked)} />
          Keep as a spare
        </label>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!name.trim() || register.isPending} onClick={save}>
            {register.isPending ? "Saving…" : "Register"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
