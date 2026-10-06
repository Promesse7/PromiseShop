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
  // Omitted when reprinting from sales history: there is no "next sale" there.
  onNewSale?: () => void;
  // A copy printed later: no "completed" banner, marked REPRINT.
  reprint?: boolean;
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

export function Receipt({ sale, lines, servedBy, onPrint, onNewSale, reprint = false }: ReceiptProps) {
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
  const payments = sale.payments ?? [];
  const balance = Number(sale.balance ?? 0);
  const changeDue = Number(sale.change_due ?? 0);

  return (
    <div className="flex flex-col gap-4">
      {!reprint && (
        <div className="flex items-center gap-2.5 p-3 rounded-md bg-accent-900 text-accent-100 text-sm shadow-sm">
          <span className="w-2 h-2 rounded-full bg-accent" />
          Sale #S-{sale.sale_id} completed — stock updated, admin notified in the app.
        </div>
      )}
      <div className="print-target bg-surface rounded-md p-6 shadow-sm text-sm max-w-[420px] mx-auto w-full">
        {reprint && (
          <div className="text-center text-[11px] font-medium tracking-widest text-text/60 mb-2">REPRINT</div>
        )}
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
        {sale.customer_name && (
          <div className="flex justify-between">
            <span className="text-text/55">Customer</span>
            <span>
              {sale.customer_name}
              {sale.customer_phone ? ` · ${sale.customer_phone}` : ""}
            </span>
          </div>
        )}
        {!payments.length && (
          <div className="flex justify-between">
            <span className="text-text/55">Payment</span>
            <span>{sale.payment_method ? PAYMENT_LABELS[sale.payment_method] : "—"}</span>
          </div>
        )}

        <hr className="border-divider my-3" />

        {sale.items.map((item) => {
          const line = lines.find((l) => l.product.product_id === item.product);
          const unitPrice = Number(item.unit_price);
          const listPrice = Number(item.list_price);
          const bargained = item.list_price !== undefined && unitPrice !== listPrice;
          return (
            <div key={item.sale_item_id} className="flex justify-between gap-2 py-0.5">
              <span>
                {line?.product.name ?? item.product_name ?? `Product #${item.product}`} × {item.quantity}
              </span>
              <span className="flex-1 text-right text-xs text-text/50 self-center">
                {bargained && (
                  <s aria-label="Catalog price" className="mr-1">
                    {listPrice.toLocaleString()}
                  </s>
                )}
                <span>@ {unitPrice.toLocaleString()}</span>
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

        {payments.length > 0 && (
          <div className="mt-2 flex flex-col gap-0.5">
            {payments.map((p) => (
              <div key={p.payment_id} className="flex justify-between text-xs">
                <span>
                  {PAYMENT_LABELS[p.method]}
                  {p.reference ? ` · ${p.reference}` : ""}
                </span>
                <span>{Number(p.amount).toLocaleString()}</span>
              </div>
            ))}
            {changeDue > 0 && (
              <div className="flex justify-between text-xs">
                <span>Change</span>
                <span>{changeDue.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}
        {Number(sale.returned_amount ?? 0) > 0 && (
          <div className="flex justify-between text-xs mt-1">
            <span>Returned</span>
            <span>− {Number(sale.returned_amount).toLocaleString()}</span>
          </div>
        )}
        {balance > 0 && (
          <div className="mt-2 rounded-md border border-amber-300 p-2 text-xs">
            <div className="flex justify-between">
              <span>Paid</span>
              <span>RWF {Number(sale.amount_paid ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Balance remaining</span>
              <span>RWF {balance.toLocaleString()}</span>
            </div>
            {sale.due_date && (
              <div className="flex justify-between">
                <span>Due by</span>
                <span>{new Date(sale.due_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
              </div>
            )}
          </div>
        )}

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
        {onNewSale && <Button onClick={onNewSale}>New sale</Button>}
      </div>
    </div>
  );
}
