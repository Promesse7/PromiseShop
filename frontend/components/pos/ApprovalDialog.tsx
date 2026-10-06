"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export interface Approval {
  approver_username: string;
  pin: string;
}

interface ApprovalDialogProps {
  open: boolean;
  // Why approval is needed, straight from the server (never mentions cost).
  reason: string;
  error?: string | null;
  submitting?: boolean;
  onApprove: (approval: Approval) => void;
  onClose: () => void;
}

/** A manager or admin types their username and PIN on the same till. */
export function ApprovalDialog({ open, reason, error, submitting, onApprove, onClose }: ApprovalDialogProps) {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");

  return (
    <Dialog open={open} onClose={onClose} title="Manager approval">
      <div className="flex flex-col gap-3 min-w-[300px]">
        <p className="text-sm text-text/70">{reason}</p>
        <Field label="Manager username" name="approver_username" value={username} onChange={setUsername} />
        <Field label="PIN" name="approval_pin" type="password" value={pin} onChange={setPin} />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!username.trim() || !pin.trim() || submitting}
            onClick={() => onApprove({ approver_username: username.trim(), pin: pin.trim() })}
          >
            {submitting ? "Checking…" : "Approve"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
