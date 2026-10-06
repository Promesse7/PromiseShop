import type { PaymentMethod } from "@/lib/types";

// One payment line on the till: how much of the sale this method covers. Cash
// may carry `tendered` (what the customer handed over) to work out change.
export interface PaymentLine {
  id: string;
  method: PaymentMethod;
  amount: number;
  reference: string;
  tendered: number | null;
}

let nextId = 0;

export function newPaymentLine(method: PaymentMethod, amount: number): PaymentLine {
  nextId += 1;
  return { id: `pay-${nextId}`, method, amount, reference: "", tendered: null };
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  mobile_money: "MoMo",
  card: "Card",
  bank_transfer: "Bank",
};

export interface PaymentSummary {
  // What actually counts toward the sale (cash trimmed to what is due).
  applied: number;
  change: number;
  remaining: number;
  nonCashOver: boolean;
  missingReference: boolean;
}

/** Mirrors the backend's rules (sales.services._normalise_payments). */
export function summarisePayments(lines: PaymentLine[], total: number): PaymentSummary {
  const active = lines.filter((l) => l.amount > 0);
  const nonCash = active.filter((l) => l.method !== "cash").reduce((sum, l) => sum + l.amount, 0);
  let roomForCash = Math.max(total - nonCash, 0);
  let change = 0;
  let appliedCash = 0;
  for (const l of active) {
    if (l.method !== "cash") continue;
    const portion = Math.min(l.amount, roomForCash);
    change += l.amount - portion;
    roomForCash -= portion;
    appliedCash += portion;
    if (l.tendered != null && l.tendered > l.amount) change += l.tendered - l.amount;
  }
  const applied = Math.min(nonCash, total) + appliedCash;
  return {
    applied,
    change,
    remaining: Math.max(total - applied, 0),
    nonCashOver: nonCash > total,
    missingReference: active.some((l) => l.method !== "cash" && !l.reference.trim()),
  };
}

export interface PaymentLinePayload {
  method: PaymentMethod;
  amount: string;
  reference?: string;
  tendered?: string;
}

export function paymentLinesPayload(lines: PaymentLine[]): PaymentLinePayload[] {
  return lines
    .filter((l) => l.amount > 0)
    .map((l) => ({
      method: l.method,
      amount: l.amount.toFixed(2),
      ...(l.method !== "cash" && l.reference.trim() ? { reference: l.reference.trim() } : {}),
      ...(l.method === "cash" && l.tendered != null && l.tendered > 0 ? { tendered: l.tendered.toFixed(2) } : {}),
    }));
}
