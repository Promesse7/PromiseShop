"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { PAYMENT_METHOD_LABELS } from "@/lib/pos/payments";
import { refundSplit, returnableQuantities, type ReturnInput } from "@/lib/sales/useSalesHistory";
import type { PaymentMethod, ReturnCondition, Sale } from "@/lib/types";
import { formatRwf } from "@/lib/format";

const METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

interface ReturnItemsDialogProps {
  open: boolean;
  sale: Sale;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (input: ReturnInput) => void;
  onClose: () => void;
}

interface LineState {
  quantity: string;
  condition: ReturnCondition;
  refund: string; // "" = the price paid
}

/** Pick which units come back, their condition and refund; shows how the refund settles. */
export function ReturnItemsDialog({ open, onClose, ...rest }: ReturnItemsDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={`Return items — sale #S-${rest.sale.sale_id}`}>
      {open && <ReturnForm key={rest.sale.sale_id} onClose={onClose} {...rest} />}
    </Dialog>
  );
}

function ReturnForm({ sale, submitting, error, onSubmit, onClose }: Omit<ReturnItemsDialogProps, "open">) {
  const returnable = useMemo(() => returnableQuantities(sale), [sale]);
  const [lines, setLines] = useState<Record<number, LineState>>(() =>
    Object.fromEntries(sale.items.map((item) => [item.sale_item_id, { quantity: "0", condition: "resellable", refund: "" }]))
  );
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function update(id: number, patch: Partial<LineState>) {
    setLines((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  const chosen = sale.items
    .map((item) => {
      const state = lines[item.sale_item_id];
      const quantity = Number(state.quantity) || 0;
      const paid = Math.round(Number(item.unit_price) * quantity * 100) / 100;
      const refund = state.refund === "" ? paid : Number(state.refund);
      return { item, state, quantity, paid, refund };
    })
    .filter((line) => line.quantity > 0);
  const refundTotal = chosen.reduce((sum, line) => sum + (Number.isNaN(line.refund) ? 0 : line.refund), 0);
  const { paidOut, balanceReduced } = refundSplit(sale, refundTotal);

  function handleSubmit() {
    if (!chosen.length) return setLocalError("Choose at least one unit to return.");
    for (const line of chosen) {
      const name = line.item.product_name ?? `Product #${line.item.product}`;
      if (line.quantity > returnable[line.item.sale_item_id]) {
        return setLocalError(`${name}: only ${returnable[line.item.sale_item_id]} can still be returned.`);
      }
      if (Number.isNaN(line.refund) || line.refund < 0 || line.refund > line.paid) {
        return setLocalError(`${name}: the refund must be between 0 and the price paid (${formatRwf(line.paid)}).`);
      }
    }
    if (!reason.trim()) return setLocalError("Say why the items are coming back.");
    if (paidOut > 0 && method !== "cash" && !reference.trim()) {
      return setLocalError("MoMo, card and bank refunds need a transaction reference.");
    }
    setLocalError(null);
    onSubmit({
      reason: reason.trim(),
      refund_method: paidOut > 0 ? method : null,
      refund_reference: paidOut > 0 ? reference.trim() : "",
      items: chosen.map((line) => ({
        sale_item: line.item.sale_item_id,
        quantity: line.quantity,
        condition: line.state.condition,
        ...(line.state.refund === "" ? {} : { refund_amount: line.refund.toFixed(2) }),
      })),
    });
  }

  return (
    <div className="flex flex-col gap-3 min-w-[360px]">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-divider text-left text-text/70">
            <th className="py-1 font-medium">Item</th>
            <th className="py-1 font-medium">Return</th>
            <th className="py-1 font-medium">Condition</th>
            <th className="py-1 font-medium">Refund</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item) => {
            const state = lines[item.sale_item_id];
            const left = returnable[item.sale_item_id];
            const name = item.product_name ?? `Product #${item.product}`;
            return (
              <tr key={item.sale_item_id} className="border-b border-divider align-top">
                <td className="py-1.5 pr-2">
                  {name}
                  <div className="text-xs text-text/50">
                    sold {item.quantity} @ {formatRwf(item.unit_price)} · {left} returnable
                  </div>
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    aria-label={`Units of ${name} to return`}
                    type="number"
                    min={0}
                    max={left}
                    disabled={left === 0}
                    value={state.quantity}
                    onChange={(e) => update(item.sale_item_id, { quantity: e.target.value })}
                    className="w-16 min-h-8 px-2 text-sm bg-surface border border-divider rounded-md"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <select
                    aria-label={`Condition of ${name}`}
                    value={state.condition}
                    onChange={(e) => update(item.sale_item_id, { condition: e.target.value as ReturnCondition })}
                    className="min-h-8 px-1 text-sm bg-surface border border-divider rounded-md"
                  >
                    <option value="resellable">Resellable</option>
                    <option value="damaged">Damaged</option>
                  </select>
                </td>
                <td className="py-1.5">
                  <input
                    aria-label={`Refund for ${name}`}
                    type="number"
                    min={0}
                    placeholder="price paid"
                    value={state.refund}
                    onChange={(e) => update(item.sale_item_id, { refund: e.target.value })}
                    className="w-24 min-h-8 px-2 text-sm bg-surface border border-divider rounded-md"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="rounded-md border border-divider p-2 text-sm flex flex-col gap-0.5" aria-label="Refund summary">
        <div className="flex justify-between"><span>Refund total</span><span>{formatRwf(refundTotal)}</span></div>
        <div className="flex justify-between text-text/70">
          <span>Reduces what is owed</span><span>{formatRwf(balanceReduced)}</span>
        </div>
        <div className="flex justify-between font-medium"><span>Pay back now</span><span>{formatRwf(paidOut)}</span></div>
      </div>

      {paidOut > 0 && (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="refund-method" className="text-xs text-text/70">Pay back by</label>
            <select
              id="refund-method"
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
            <Field label="Transaction reference" name="refund-reference" value={reference} onChange={setReference} />
          )}
        </>
      )}
      <Field label="Reason" name="return-reason" value={reason} onChange={setReason} />
      {(localError || error) && <p className="text-xs text-red-600">{localError ?? error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={submitting}>{submitting ? "Saving…" : "Record return"}</Button>
      </div>
    </div>
  );
}
