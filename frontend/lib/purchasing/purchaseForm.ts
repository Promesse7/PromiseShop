// Payment status is no longer chosen here: it is derived from the supplier
// payments recorded against the purchase (Module B). Only the due date is set.
export interface PurchaseFormValues {
  supplier: number | "";
  invoice_number: string;
  purchase_date: string;
  due_date: string;
  // Module H4: only a proper VAT invoice gives input VAT back.
  has_vat_invoice: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function emptyPurchaseFormValues(): PurchaseFormValues {
  return { supplier: "", invoice_number: "", purchase_date: today(), due_date: "", has_vat_invoice: true };
}

export interface PurchasePayload {
  supplier: number;
  invoice_number: string | null;
  purchase_date: string;
  due_date: string | null;
  has_vat_invoice: boolean;
}

export function buildPurchasePayload(values: PurchaseFormValues): PurchasePayload {
  return {
    supplier: values.supplier === "" ? 0 : values.supplier,
    invoice_number: values.invoice_number.trim() || null,
    purchase_date: values.purchase_date,
    due_date: values.due_date || null,
    has_vat_invoice: values.has_vat_invoice,
  };
}

export type PurchaseFormErrors = Partial<Record<"supplier" | "purchase_date", string>>;

export function validatePurchaseForm(values: PurchaseFormValues): PurchaseFormErrors {
  const errors: PurchaseFormErrors = {};
  if (values.supplier === "") {
    errors.supplier = "Supplier is required.";
  }
  if (!values.purchase_date.trim()) {
    errors.purchase_date = "Purchase date is required.";
  }
  return errors;
}
