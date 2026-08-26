"use client";

import { Button } from "@/components/ui/Button";
import { Barcode } from "@/components/ui/Barcode";
import { QrCode } from "@/components/ui/QrCode";
import { useShopProfile } from "@/lib/settings/useShopProfile";
import type { CartLine } from "@/lib/pos/cart";
import type { PaymentMethod, Sale } from "@/lib/types";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  mobile_money: "Mobile Money",
  bank_transfer: "Bank Transfer",
};

const TAX_CATEGORY_LABELS: Record<"A" | "B", string> = {
  A: "A — Exempt (0%)",
  B: "B — Standard (18%)",
};

interface ReceiptProps {
  sale: Sale;
  lines: CartLine[];
  servedBy: string;
  onPrint: () => void;
  onNewSale: () => void;
}

interface TaxGroupTotal {
  category: "A" | "B";
  subtotal: number;
  tax: number;
}

function taxGroupTotals(sale: Sale): TaxGroupTotal[] {
  const totals = new Map<"A" | "B", TaxGroupTotal>();
  for (const item of sale.items) {
    const existing = totals.get(item.tax_category) ?? { category: item.tax_category, subtotal: 0, tax: 0 };
    existing.subtotal += Number(item.subtotal);
    existing.tax += Number(item.tax_amount);
    totals.set(item.tax_category, existing);
  }
  return Array.from(totals.values()).sort((a, b) => a.category.localeCompare(b.category));
}

export function Receipt({ sale, lines, servedBy, onPrint, onNewSale }: ReceiptProps) {
  const shopProfile = useShopProfile();
  const saleDate = new Date(sale.sale_date).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const groups = taxGroupTotals(sale);
  const totalTax = groups.reduce((sum, g) => sum + g.tax, 0);
  const qrPayload = `SAMPLE RECEIPT #${sale.sale_id} — NOT FISCALLY VALID`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5 p-3 rounded-md bg-accent-900 text-accent-100 text-sm shadow-sm">
        <span className="w-2 h-2 rounded-full bg-accent" />
        Sale #S-{sale.sale_id} completed — stock updated, admin notified by email.
      </div>
      <div className="print-target bg-surface rounded-md p-6 shadow-sm text-sm max-w-[420px] mx-auto w-full">
        <div className="text-center mb-4">
          <div className="font-sans font-medium text-xl">
            {shopProfile.data?.business_name ?? "Promise Electronic Shop"}
          </div>
          {shopProfile.data?.tin && <div className="text-xs text-text/50">TIN {shopProfile.data.tin}</div>}
          {shopProfile.data?.po_box && <div className="text-xs text-text/50">{shopProfile.data.po_box}</div>}
          <div className="text-xs text-text/50">
            {[shopProfile.data?.phone, shopProfile.data?.email].filter(Boolean).join(" · ") || "—"}
          </div>
          {shopProfile.data?.address && <div className="text-xs text-text/50">{shopProfile.data.address}</div>}
        </div>

        <div className="flex justify-between">
          <span className="text-text/55">Receipt</span>
          <span className="font-mono">#S-{sale.sale_id}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text/55">Date</span>
          <span>{saleDate}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text/55">Served by</span>
          <span>{servedBy}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text/55">Payment</span>
          <span>{sale.payment_method ? PAYMENT_LABELS[sale.payment_method] : "—"}</span>
        </div>

        <hr className="border-divider my-3" />

        {sale.items.map((item) => {
          const line = lines.find((l) => l.product.product_id === item.product);
          return (
            <div key={item.sale_item_id} className="flex justify-between py-0.5">
              <span>
                {line?.product.name ?? `Product #${item.product}`} × {item.quantity}
              </span>
              <span>{Number(item.subtotal).toLocaleString()}</span>
            </div>
          );
        })}

        <hr className="border-divider my-3" />

        {groups.map((g) => (
          <div key={g.category} className="flex justify-between text-xs text-text/60">
            <span>TOTAL {TAX_CATEGORY_LABELS[g.category]}</span>
            <span>{g.subtotal.toLocaleString()}</span>
          </div>
        ))}
        <div className="flex justify-between text-xs text-text/60">
          <span>TOTAL TAX</span>
          <span>{totalTax.toLocaleString()}</span>
        </div>

        <div className="flex justify-between font-sans font-medium text-xl mt-2">
          <span>Total</span>
          <span>RWF {Number(sale.total_amount).toLocaleString()}</span>
        </div>

        <hr className="border-divider my-3" />

        <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-center py-1 text-[11px] font-medium mb-2">
          SAMPLE RECEIPT — pending EBM/SDC certification
        </div>
        <div className="flex justify-between text-xs text-text/50">
          <span>SDC ID</span>
          <span>NOT-CERTIFIED</span>
        </div>
        <div className="flex justify-between text-xs text-text/50">
          <span>MRC</span>
          <span>PENDING-SETUP</span>
        </div>
        <div className="flex justify-center my-3">
          <QrCode value={qrPayload} size={88} />
        </div>
        <div className="flex justify-center mb-3">
          <Barcode value={`S-${sale.sale_id}`} height={28} fontSize={10} />
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
