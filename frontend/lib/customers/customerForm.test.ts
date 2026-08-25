import { describe, expect, it } from "vitest";
import {
  emptyCustomerFormValues,
  customerFormValuesFromCustomer,
  buildCustomerPayload,
  validateCustomerForm,
} from "./customerForm";

describe("customerForm", () => {
  it("builds empty values", () => {
    expect(emptyCustomerFormValues()).toEqual({ name: "", phone: "", email: "", address: "" });
  });

  it("maps a Customer to form values, defaulting nulls to empty strings", () => {
    const values = customerFormValuesFromCustomer({ customer_id: 1, name: null, phone: null, email: null, address: null });
    expect(values).toEqual({ name: "", phone: "", email: "", address: "" });
  });

  it("builds a payload trimming whitespace and nulling blanks", () => {
    const payload = buildCustomerPayload({ name: "  Grace Mukamana  ", phone: "", email: "", address: "" });
    expect(payload).toEqual({ name: "Grace Mukamana", phone: null, email: null, address: null });
  });

  it("requires a name even though the backend model allows a blank one", () => {
    expect(validateCustomerForm(emptyCustomerFormValues())).toEqual({ name: "Name is required." });
    expect(validateCustomerForm({ ...emptyCustomerFormValues(), name: "Grace" })).toEqual({});
  });
});
