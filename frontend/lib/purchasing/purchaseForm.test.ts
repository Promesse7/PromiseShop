import { describe, expect, it } from "vitest";
import { emptyPurchaseFormValues, buildPurchasePayload, validatePurchaseForm } from "./purchaseForm";

describe("purchaseForm", () => {
  it("builds empty values defaulting payment_status to paid and purchase_date to today", () => {
    const values = emptyPurchaseFormValues();
    expect(values.supplier).toBe("");
    expect(values.invoice_number).toBe("");
    expect(values.payment_status).toBe("paid");
    expect(values.purchase_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("builds a payload, trimming invoice number and nulling it when blank", () => {
    const payload = buildPurchasePayload({
      supplier: 3, invoice_number: "  KE-8841  ", purchase_date: "2026-08-23", payment_status: "partial",
    });
    expect(payload).toEqual({
      supplier: 3, invoice_number: "KE-8841", purchase_date: "2026-08-23", payment_status: "partial",
    });

    const blank = buildPurchasePayload({
      supplier: 3, invoice_number: "   ", purchase_date: "2026-08-23", payment_status: "paid",
    });
    expect(blank.invoice_number).toBeNull();
  });

  it("requires supplier and purchase_date", () => {
    expect(validatePurchaseForm(emptyPurchaseFormValues())).toEqual({
      supplier: "Supplier is required.",
    });
    expect(
      validatePurchaseForm({ ...emptyPurchaseFormValues(), supplier: 1, purchase_date: "" })
    ).toEqual({ purchase_date: "Purchase date is required." });
    expect(validatePurchaseForm({ ...emptyPurchaseFormValues(), supplier: 1 })).toEqual({});
  });
});
