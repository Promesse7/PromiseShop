import type { Customer } from "@/lib/types";

export interface CustomerFormValues {
  name: string;
  phone: string;
  email: string;
  address: string;
}

export function emptyCustomerFormValues(): CustomerFormValues {
  return { name: "", phone: "", email: "", address: "" };
}

export function customerFormValuesFromCustomer(customer: Customer): CustomerFormValues {
  return {
    name: customer.name ?? "",
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    address: customer.address ?? "",
  };
}

export interface CustomerPayload {
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
}

export function buildCustomerPayload(values: CustomerFormValues): CustomerPayload {
  return {
    name: values.name.trim() || null,
    phone: values.phone.trim() || null,
    email: values.email.trim() || null,
    address: values.address.trim() || null,
  };
}

export type CustomerFormErrors = Partial<Record<"name", string>>;

/**
 * The backend Customer model allows a blank name (walk-in sales need no customer record at
 * all), but a *record you're deliberately creating here* is pointless with no identifying
 * info — so the UI form requires a name, unlike the backend.
 */
export function validateCustomerForm(values: CustomerFormValues): CustomerFormErrors {
  const errors: CustomerFormErrors = {};
  if (!values.name.trim()) {
    errors.name = "Name is required.";
  }
  return errors;
}
