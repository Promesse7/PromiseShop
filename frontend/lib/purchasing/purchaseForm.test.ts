import { describe, expect, it } from "vitest";
import { emptyPurchaseFormValues, buildPurchasePayload, validatePurchaseForm } from "./purchaseForm";

describe("purchaseForm", () => {
  it("builds empty values with purchase_date today and no due date", () => {
    const values = emptyPurchaseFormValues();
    expect(values.supplier).toBe("");
    expect(values.invoice_number).toBe("");
    expect(values.due_date).toBe("");
    expect(values.purchase_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("builds a payload, trimming invoice number and nulling blanks; never sends a payment status", () => {
    const payload = buildPurchasePayload({
      supplier: 3, invoice_number: "  KE-8841  ", purchase_date: "2026-08-23", due_date: "2026-09-22",
      has_vat_invoice: true,
    });
    expect(payload).toEqual({
      supplier: 3, invoice_number: "KE-8841", purchase_date: "2026-08-23", due_date: "2026-09-22",
      has_vat_invoice: true,
    });

    const blank = buildPurchasePayload({
      supplier: 3, invoice_number: "   ", purchase_date: "2026-08-23", due_date: "", has_vat_invoice: true,
    });
    expect(blank.invoice_number).toBeNull();
    expect(blank.due_date).toBeNull();
    expect("payment_status" in blank).toBe(false);
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

  it("assumes a VAT invoice unless the user unticks it, and sends the flag", () => {
    expect(emptyPurchaseFormValues().has_vat_invoice).toBe(true);
    const payload = buildPurchasePayload({ ...emptyPurchaseFormValues(), supplier: 2, has_vat_invoice: false });
    expect(payload.has_vat_invoice).toBe(false);
  });
});
