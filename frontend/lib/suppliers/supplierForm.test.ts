import { describe, expect, it } from "vitest";
import {
  emptySupplierFormValues,
  supplierFormValuesFromSupplier,
  buildSupplierPayload,
  validateSupplierForm,
} from "./supplierForm";

describe("supplierForm", () => {
  it("builds empty values", () => {
    expect(emptySupplierFormValues()).toEqual({
      name: "", contact_person: "", phone: "", email: "", address: "",
    });
  });

  it("maps a Supplier to form values, defaulting nulls to empty strings", () => {
    const values = supplierFormValuesFromSupplier({
      supplier_id: 1, name: "Kigali Electronics Ltd", contact_person: null, phone: null, email: null, address: null,
    });
    expect(values).toEqual({
      name: "Kigali Electronics Ltd", contact_person: "", phone: "", email: "", address: "",
    });
  });

  it("builds a payload trimming whitespace and nulling blank optional fields", () => {
    const payload = buildSupplierPayload({
      name: "  Kigali Electronics Ltd  ", contact_person: "", phone: " +250781234567 ", email: "", address: "",
    });
    expect(payload).toEqual({
      name: "Kigali Electronics Ltd", contact_person: null, phone: "+250781234567", email: null, address: null,
    });
  });

  it("requires a name", () => {
    expect(validateSupplierForm(emptySupplierFormValues())).toEqual({ name: "Name is required." });
    expect(validateSupplierForm({ ...emptySupplierFormValues(), name: "Acme" })).toEqual({});
  });
});
