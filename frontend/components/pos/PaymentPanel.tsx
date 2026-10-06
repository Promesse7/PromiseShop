"use client";

import { Button } from "@/components/ui/Button";
import {
  newPaymentLine, PAYMENT_METHOD_LABELS, summarisePayments, type PaymentLine,
} from "@/lib/pos/payments";
import type { PaymentMethod } from "@/lib/types";

interface PaymentPanelProps {
  total: number;
  lines: PaymentLine[];
  onChange: (lines: PaymentLine[]) => void;
  dueDate: string;
  onDueDateChange: (value: string) => void;
  hasCustomer: boolean;
}

const METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];
const inputClass = "min-h-9 py-1.5 px-2 text-sm text-text bg-surface border border-divider rounded-md";

function toNumber(raw: string): number {
  const parsed = Number(raw);
  return raw === "" || Number.isNaN(parsed) ? 0 : parsed;
}

/** One or more payment lines (split payment), cash tendered/change, and credit. */
export function PaymentPanel({ total, lines, onChange, dueDate, onDueDateChange, hasCustomer }: PaymentPanelProps) {
  const summary = summarisePayments(lines, total);

  function update(id: string, patch: Partial<PaymentLine>) {
    onChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="block text-xs text-text/70">Payment</label>
      {lines.map((line, index) => (
        <div key={line.id} className="flex flex-wrap items-center gap-1.5">
          <select
            aria-label={`Payment ${index + 1} method`}
            value={line.method}
            onChange={(e) => update(line.id, { method: e.target.value as PaymentMethod, tendered: null })}
            className={inputClass}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            aria-label={`Payment ${index + 1} amount`}
            value={line.amount === 0 ? "" : line.amount}
            onChange={(e) => update(line.id, { amount: toNumber(e.target.value) })}
            className={`${inputClass} w-28 text-right`}
          />
          {line.method === "cash" ? (
            <input
              type="number"
              min={0}
              aria-label={`Payment ${index + 1} tendered`}
              placeholder="Tendered"
              value={line.tendered ?? ""}
              onChange={(e) => update(line.id, { tendered: e.target.value === "" ? null : toNumber(e.target.value) })}
              className={`${inputClass} w-24 text-right`}
            />
          ) : (
            <input
              aria-label={`Payment ${index + 1} reference`}
              placeholder="Transaction ref"
              value={line.reference}
              onChange={(e) => update(line.id, { reference: e.target.value })}
              className={`${inputClass} w-32 ${line.amount > 0 && !line.reference.trim() ? "border-red-400" : ""}`}
            />
          )}
          {lines.length > 1 && (
            <Button variant="ghost" className="text-xs" onClick={() => onChange(lines.filter((l) => l.id !== line.id))}>
              Remove
            </Button>
          )}
        </div>
      ))}
      <Button
        variant="ghost"
        className="self-start text-xs"
        onClick={() => onChange([...lines, newPaymentLine("mobile_money", Math.max(summary.remaining, 0))])}
      >
        + Split payment
      </Button>

      <div className="text-sm flex flex-col gap-0.5">
        <div className="flex justify-between">
          <span className="text-text/70">Paid now</span>
          <span>RWF {summary.applied.toLocaleString()}</span>
        </div>
        {summary.change > 0 && (
          <div className="flex justify-between font-medium">
            <span>Change</span>
            <span>RWF {summary.change.toLocaleString()}</span>
          </div>
        )}
        {summary.remaining > 0 && (
          <>
            <div className="flex justify-between text-amber-500 font-medium">
              <span>Remaining on credit</span>
              <span>RWF {summary.remaining.toLocaleString()}</span>
            </div>
            <label className="flex items-center justify-between gap-2 text-xs text-text/70">
              Due date
              <input
                type="date"
                aria-label="Credit due date"
                value={dueDate}
                onChange={(e) => onDueDateChange(e.target.value)}
                className={inputClass}
              />
            </label>
            {!hasCustomer && (
              <p className="text-xs text-red-400">Choose a customer (with a phone) to sell on credit.</p>
            )}
          </>
        )}
        {summary.nonCashOver && <p className="text-xs text-red-400">Non-cash payments are more than the total.</p>}
        {summary.missingReference && (
          <p className="text-xs text-red-400">MoMo, card and bank payments need a transaction reference.</p>
        )}
      </div>
    </div>
  );
}
