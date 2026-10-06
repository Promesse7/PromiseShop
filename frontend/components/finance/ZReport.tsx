import { PAYMENT_METHOD_LABELS } from "@/lib/pos/payments";
import type { DailyClose, DayFigures, PaymentMethod } from "@/lib/types";

interface ZReportProps {
  figures: DayFigures;
  // Present once the day is closed: counted cash, variance and who confirmed.
  close?: DailyClose | null;
}

function money(value: string | number) {
  return `RWF ${Number(value).toLocaleString()}`;
}

function Row({ label, value, strong = false }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-medium" : ""}`}>
      <span className="text-text/70">{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** The printable end-of-day summary for one cashier's day. */
export function ZReport({ figures, close }: ZReportProps) {
  const methods = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];
  const variance = close ? Number(close.variance) : null;
  return (
    <div className="print-target bg-surface rounded-md p-5 shadow-sm text-sm max-w-[420px] w-full flex flex-col gap-1">
      <div className="text-center font-medium text-base">Z-report</div>
      <div className="text-center text-xs text-text/60 mb-2">
        {figures.cashier_name} · {figures.business_date}
      </div>
      <Row label="Sales" value={`${figures.sales_count} · ${money(figures.sales_total)}`} />
      {figures.voided_count > 0 && <Row label="Voided sales" value={figures.voided_count} />}
      <Row label="Discounts given" value={money(figures.discounts_given)} />
      <Row label="Returns" value={`${figures.returns_count} · ${money(figures.returns_refunded)}`} />
      <Row label="Debt collected" value={money(figures.debt_collected)} />
      <Row label="New credit given" value={money(figures.new_credit)} />
      <hr className="border-divider my-2" />
      {methods.map((m) => {
        const row = figures.by_method[m];
        if (!row || (Number(row.in) === 0 && Number(row.out) === 0)) return null;
        return (
          <div key={m}>
            <Row label={PAYMENT_METHOD_LABELS[m]} value={money(row.net)} />
            {Number(row.out) > 0 && <div className="text-xs text-text/50 text-right">in {money(row.in)} · out {money(row.out)}</div>}
            {row.references.map((r) => (
              <div key={r.payment_id} className="text-xs text-text/50 flex justify-between pl-3">
                <span>#S-{r.sale_id} · {r.reference}</span>
                <span>{Number(r.amount).toLocaleString()}</span>
              </div>
            ))}
          </div>
        );
      })}
      <hr className="border-divider my-2" />
      <Row label="Opening float" value={money(figures.opening_float)} />
      <Row label="Expected cash" value={money(close?.expected_cash ?? figures.expected_cash)} strong />
      {close && (
        <>
          <Row label="Counted cash" value={money(close.counted_cash)} strong />
          <Row
            label="Variance"
            value={
              <span className={variance === 0 ? "" : "text-red-600"}>
                {variance !== null && variance > 0 ? "+" : ""}
                {money(close.variance)}
              </span>
            }
            strong
          />
          <Row label="Confirmed by" value={close.closed_by_name} />
          {close.note && <Row label="Note" value={close.note} />}
        </>
      )}
    </div>
  );
}
