"use client";

import { Button } from "@/components/ui/Button";
import type { CartLine } from "@/lib/pos/cart";
import type { PaymentMethod, Sale } from "@/lib/types";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  mobile_money: "Mobile Money",
  bank_transfer: "Bank Transfer",
};

interface ReceiptProps {
  sale: Sale;
  lines: CartLine[];
  servedBy: string;
  onPrint: () => void;
  onNewSale: () => void;
}

export function Receipt({ sale, lines, servedBy, onPrint, onNewSale }: ReceiptProps) {
  const saleDate = new Date(sale.sale_date).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5 p-3 rounded-md bg-accent-900 text-accent-100 text-sm shadow-sm">
        <span className="w-2 h-2 rounded-full bg-accent" />
        Sale #S-{sale.sale_id} completed — stock updated, admin notified by email.
      </div>
      <div className="receipt-print bg-surface rounded-md p-6 shadow-sm">
        <div className="text-center mb-4">
          <div className="font-sans font-medium text-lg">Promise Electronic Shop</div>
          <div className="text-xs text-text/50">[Shop Address] · [Phone] · [Email]</div>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text/55">Receipt</span>
          <span className="font-mono">#S-{sale.sale_id}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text/55">Date</span>
          <span>{saleDate}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text/55">Served by</span>
          <span>{servedBy}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text/55">Payment</span>
          <span>{sale.payment_method ? PAYMENT_LABELS[sale.payment_method] : "—"}</span>
        </div>
        <hr className="border-divider my-2" />
        {lines.map((line) => (
          <div key={line.product.product_id} className="flex justify-between text-sm">
            <span>
              {line.product.name} × {line.quantity}
            </span>
            <span>{(line.product.retail_price * line.quantity).toLocaleString()}</span>
          </div>
        ))}
        <hr className="border-divider my-2" />
        <div className="flex justify-between font-sans font-medium text-lg">
          <span>Total</span>
          <span>RWF {Number(sale.total_amount).toLocaleString()}</span>
        </div>
        <p className="text-xs text-text/50 text-center mt-4">
          Murakoze! Thank you for shopping with us.
          <br />
          Warranty per product — keep this receipt.
        </p>
      </div>
      <div className="flex gap-2 justify-end print:hidden">
        <Button variant="secondary" onClick={onPrint}>
          Print receipt
        </Button>
        <Button onClick={onNewSale}>New sale</Button>
      </div>
    </div>
  );
}
