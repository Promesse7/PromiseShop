"use client";

import { Button } from "@/components/ui/Button";
import { useShopProfile } from "@/lib/settings/useShopProfile";
import { PAYMENT_METHOD_LABELS } from "@/lib/pos/payments";
import type { CustomerPaymentResult } from "@/lib/types";

interface PaymentReceiptProps {
  result: CustomerPaymentResult;
  customerName: string;
  onClose: () => void;
}

/** Printable receipt for a later payment against a customer's debt. */
export function PaymentReceipt({ result, customerName, onClose }: PaymentReceiptProps) {
  const shop = useShopProfile();
  const first = result.payments[0];
  const paidAt = first ? new Date(first.paid_at) : new Date();

  return (
    <div className="flex flex-col gap-3">
      <div className="print-target bg-surface rounded-md p-5 text-sm max-w-[380px] w-full mx-auto">
        <div className="text-center mb-3">
          <div className="font-sans font-medium text-lg">{shop.data?.business_name ?? "Promise Electronic Shop"}</div>
          {shop.data?.tin && <div className="text-xs text-text/50">TIN {shop.data.tin}</div>}
          <div className="text-xs text-text/50">{[shop.data?.phone, shop.data?.email].filter(Boolean).join(" · ")}</div>
          <div className="mt-2 font-medium">Payment receipt</div>
        </div>
        <div className="flex justify-between"><span className="text-text/55">Receipt</span><span className="font-mono">{result.receipt_group.slice(0, 8).toUpperCase()}</span></div>
        <div className="flex justify-between"><span className="text-text/55">Date</span><span>{paidAt.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>
        <div className="flex justify-between"><span className="text-text/55">Customer</span><span>{customerName}</span></div>
        {first && (
          <div className="flex justify-between">
            <span className="text-text/55">Method</span>
            <span>{PAYMENT_METHOD_LABELS[first.method]}{first.reference ? ` · ${first.reference}` : ""}</span>
          </div>
        )}
        <hr className="border-divider my-2" />
        {result.payments.map((p) => (
          <div key={p.payment_id} className="flex justify-between">
            <span>Sale #S-{p.sale}</span>
            <span>{Number(p.amount).toLocaleString()}</span>
          </div>
        ))}
        <hr className="border-divider my-2" />
        <div className="flex justify-between font-medium"><span>Paid</span><span>RWF {Number(result.amount).toLocaleString()}</span></div>
        <div className="flex justify-between"><span>Balance still owed</span><span>RWF {Number(result.balance_after).toLocaleString()}</span></div>
        <p className="text-xs text-text/50 text-center mt-3">Murakoze! Thank you.</p>
      </div>
      <div className="flex gap-2 justify-end print:hidden">
        <Button variant="secondary" onClick={() => window.print()}>Print receipt</Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}
