"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { PAYMENT_METHOD_LABELS } from "@/lib/pos/payments";
import type { PaymentInput } from "@/lib/finance/useDebts";
import type { PaymentMethod } from "@/lib/types";

const METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

interface RecordPaymentDialogProps {
  open: boolean;
  title: string;
  // Who is paying / being paid, for the header line.
  subject: string;
  // The most this payment may be (what is owed); the amount starts here.
  maxAmount: number;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (input: PaymentInput) => void;
  onClose: () => void;
  children?: React.ReactNode;
}

/** Amount, method and reference for one payment; refuses more than is owed. */
export function RecordPaymentDialog({ open, onClose, ...rest }: RecordPaymentDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={rest.title}>
      {open && <PaymentFields key={`${rest.subject}-${rest.maxAmount}`} onClose={onClose} {...rest} />}
    </Dialog>
  );
}

function PaymentFields({
  subject, maxAmount, submitting, error, onSubmit, onClose, children,
}: Omit<RecordPaymentDialogProps, "open" | "title">) {
  const [amount, setAmount] = useState(String(maxAmount));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit() {
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) {
      setLocalError("Enter an amount above zero.");
      return;
    }
    if (value > maxAmount) {
      setLocalError(`That is more than is owed (RWF ${maxAmount.toLocaleString()}).`);
      return;
    }
    if (method !== "cash" && !reference.trim()) {
      setLocalError("MoMo, card and bank payments need a transaction reference.");
      return;
    }
    setLocalError(null);
    onSubmit({ amount: value.toFixed(2), method, reference: reference.trim(), note: note.trim() });
  }

  return (
    <div className="flex flex-col gap-3 min-w-[340px]">
      <p className="text-sm text-text/70">
        {subject} · owes RWF {maxAmount.toLocaleString()}
      </p>
      {children}
      <Field label="Amount (RWF)" name="amount" type="number" value={amount} onChange={setAmount} />
      <div className="flex flex-col gap-1">
        <label htmlFor="payment-method" className="text-xs text-text/70">Method</label>
        <select
          id="payment-method"
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          className="min-h-9 py-1.5 px-2 text-sm text-text bg-surface border border-divider rounded-md"
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
          ))}
        </select>
      </div>
      {method !== "cash" && (
        <Field label="Transaction reference" name="reference" value={reference} onChange={setReference} />
      )}
      <Field label="Note (optional)" name="note" value={note} onChange={setNote} />
      {(localError || error) && <p className="text-xs text-red-400">{localError ?? error}</p>}
      <div className="flex gap-2 justify-end">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={submitting}>{submitting ? "Saving…" : "Record payment"}</Button>
      </div>
    </div>
  );
}
