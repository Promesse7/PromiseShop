"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/layout/ToastProvider";
import { apiFetch, ApiError, extractErrorMessage } from "@/lib/api-client";
import type { Employee } from "@/lib/types";

interface SetPinDialogProps {
  employee: Employee | null;
  onClose: () => void;
}

/** Admin sets the 4–6 digit PIN a manager/admin types to approve prices at the till. */
export function SetPinDialog({ employee, onClose }: SetPinDialogProps) {
  return (
    <Dialog open={employee !== null} onClose={onClose} title="Approval PIN">
      {employee && <PinFields key={employee.employee_id} employee={employee} onClose={onClose} />}
    </Dialog>
  );
}

function PinFields({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!/^\d{4,6}$/.test(pin)) {
      setError("The PIN must be 4 to 6 digits.");
      return;
    }
    if (pin !== confirm) {
      setError("The two PINs don't match.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`employees/${employee.employee_id}/set-pin/`, { method: "POST", body: JSON.stringify({ pin }) });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      show(`Approval PIN set for ${employee.full_name}.`, "success");
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? extractErrorMessage(e.body) : "Couldn't save the PIN.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 min-w-[300px]">
      <p className="text-sm text-text/70">
        {employee.full_name} types this PIN on a cashier&apos;s till to approve a large discount, a price below the
        minimum, or credit above a customer&apos;s limit.
      </p>
      <Field label="New PIN" name="pin" type="password" value={pin} onChange={setPin} />
      <Field label="Repeat PIN" name="pin_confirm" type="password" value={confirm} onChange={setConfirm} />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save PIN"}</Button>
      </div>
    </div>
  );
}
