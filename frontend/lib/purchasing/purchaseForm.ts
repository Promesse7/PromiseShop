export interface PurchaseFormValues {
  supplier: number | "";
  invoice_number: string;
  purchase_date: string;
  payment_status: "paid" | "partial" | "unpaid";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function emptyPurchaseFormValues(): PurchaseFormValues {
  return { supplier: "", invoice_number: "", purchase_date: today(), payment_status: "paid" };
}

export interface PurchasePayload {
  supplier: number;
  invoice_number: string | null;
  purchase_date: string;
  payment_status: "paid" | "partial" | "unpaid";
}

export function buildPurchasePayload(values: PurchaseFormValues): PurchasePayload {
  return {
    supplier: values.supplier === "" ? 0 : values.supplier,
    invoice_number: values.invoice_number.trim() || null,
    purchase_date: values.purchase_date,
    payment_status: values.payment_status,
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
