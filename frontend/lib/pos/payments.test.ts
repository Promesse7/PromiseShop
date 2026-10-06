import { describe, expect, it } from "vitest";
import { newPaymentLine, paymentLinesPayload, summarisePayments, type PaymentLine } from "./payments";

function line(overrides: Partial<PaymentLine>): PaymentLine {
  return { ...newPaymentLine("cash", 0), ...overrides };
}

describe("summarisePayments", () => {
  it("is fully paid when payments cover the total", () => {
    const summary = summarisePayments([line({ method: "cash", amount: 100 })], 100);
    expect(summary).toMatchObject({ applied: 100, change: 0, remaining: 0, nonCashOver: false });
  });

  it("treats cash beyond the total as change", () => {
    const summary = summarisePayments(
      [line({ method: "mobile_money", amount: 40, reference: "MP1" }), line({ method: "cash", amount: 100 })],
      100
    );
    expect(summary).toMatchObject({ applied: 100, change: 40, remaining: 0 });
  });

  it("adds cash tendered above the amount to the change", () => {
    const summary = summarisePayments([line({ method: "cash", amount: 100, tendered: 120 })], 100);
    expect(summary.change).toBe(20);
  });

  it("leaves a remaining balance on credit when underpaid", () => {
    const summary = summarisePayments([line({ method: "cash", amount: 30 })], 100);
    expect(summary).toMatchObject({ applied: 30, remaining: 70 });
  });

  it("flags non-cash payments above the total", () => {
    expect(summarisePayments([line({ method: "card", amount: 150, reference: "C" })], 100).nonCashOver).toBe(true);
  });

  it("flags non-cash lines with no reference", () => {
    expect(summarisePayments([line({ method: "card", amount: 50 })], 100).missingReference).toBe(true);
    expect(summarisePayments([line({ method: "cash", amount: 50 })], 100).missingReference).toBe(false);
  });
});

describe("paymentLinesPayload", () => {
  it("drops empty lines and sends tendered only for cash", () => {
    expect(
      paymentLinesPayload([
        line({ method: "cash", amount: 100, tendered: 120 }),
        line({ method: "mobile_money", amount: 0 }),
        line({ method: "card", amount: 50, reference: " C-9 ", tendered: 70 }),
      ])
    ).toEqual([
      { method: "cash", amount: "100.00", tendered: "120.00" },
      { method: "card", amount: "50.00", reference: "C-9" },
    ]);
  });
});
