import type { Supplier } from "@/lib/types";

export interface SupplierFormValues {
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
}

export function emptySupplierFormValues(): SupplierFormValues {
  return { name: "", contact_person: "", phone: "", email: "", address: "" };
}

export function supplierFormValuesFromSupplier(supplier: Supplier): SupplierFormValues {
  return {
    name: supplier.name,
    contact_person: supplier.contact_person ?? "",
    phone: supplier.phone ?? "",
    email: supplier.email ?? "",
    address: supplier.address ?? "",
  };
}

export interface SupplierPayload {
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
}

export function buildSupplierPayload(values: SupplierFormValues): SupplierPayload {
  return {
    name: values.name.trim(),
    contact_person: values.contact_person.trim() || null,
    phone: values.phone.trim() || null,
    email: values.email.trim() || null,
    address: values.address.trim() || null,
  };
}

export type SupplierFormErrors = Partial<Record<"name", string>>;

export function validateSupplierForm(values: SupplierFormValues): SupplierFormErrors {
  const errors: SupplierFormErrors = {};
  if (!values.name.trim()) {
    errors.name = "Name is required.";
  }
  return errors;
}
