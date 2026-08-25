import { describe, expect, it } from "vitest";
import {
  emptyExistingProductItemValues,
  emptyNewProductItemValues,
  buildAddItemPayload,
  validateAddItemForm,
} from "./purchaseItemForm";

describe("purchaseItemForm", () => {
  it("builds an existing-product payload with only the product id, quantity, and costs", () => {
    const values = {
      ...emptyExistingProductItemValues(7),
      quantity: "8",
      unit_cost_paid: "108000",
      unit_cost_invoiced: "108000",
    };
    const payload = buildAddItemPayload(values, "existing");
    expect(payload).toEqual({
      product: 7, quantity: 8, unit_cost_paid: "108000", unit_cost_invoiced: "108000", price_discrepancy_note: "",
    });
  });

  it("builds a new-product payload with catalog fields and no product id", () => {
    const values = {
      ...emptyNewProductItemValues("JBL Flip 6 Speaker"),
      category: 2,
      brand: "JBL",
      model_number: "JBLFLIP6BLK",
      specifications: "30 W RMS",
      quantity: "8",
      unit_cost_paid: "108000",
      unit_cost_invoiced: "112000",
      selling_price: "145000",
      price_discrepancy_note: "Verbal bulk discount",
    };
    const payload = buildAddItemPayload(values, "new");
    expect(payload).toEqual({
      category: 2,
      name: "JBL Flip 6 Speaker",
      brand: "JBL",
      model_number: "JBLFLIP6BLK",
      specifications: "30 W RMS",
      usage_instructions: "",
      warranty_months: undefined,
      reorder_level: undefined,
      selling_price: "145000",
      quantity: 8,
      unit_cost_paid: "108000",
      unit_cost_invoiced: "112000",
      price_discrepancy_note: "Verbal bulk discount",
    });
  });

  it("requires a product selection in existing mode", () => {
    const errors = validateAddItemForm(
      { ...emptyExistingProductItemValues(""), quantity: "1", unit_cost_paid: "1", unit_cost_invoiced: "1" },
      "existing"
    );
    expect(errors.product).toBe("Select a product.");
  });

  it("requires category, name, and selling price in new-product mode", () => {
    const errors = validateAddItemForm(emptyNewProductItemValues(), "new");
    expect(errors.category).toBe("Category is required.");
    expect(errors.name).toBe("Product name is required.");
    expect(errors.selling_price).toBe("Selling price is required.");
  });

  it("requires quantity >= 1 and non-negative costs", () => {
    const errors = validateAddItemForm(
      { ...emptyExistingProductItemValues(1), quantity: "0", unit_cost_paid: "-1", unit_cost_invoiced: "" },
      "existing"
    );
    expect(errors.quantity).toBeTruthy();
    expect(errors.unit_cost_paid).toBeTruthy();
    expect(errors.unit_cost_invoiced).toBeTruthy();
  });

  it("requires a discrepancy note only when paid and invoiced costs differ", () => {
    const same = validateAddItemForm(
      { ...emptyExistingProductItemValues(1), quantity: "1", unit_cost_paid: "100", unit_cost_invoiced: "100" },
      "existing"
    );
    expect(same.price_discrepancy_note).toBeUndefined();

    const different = validateAddItemForm(
      { ...emptyExistingProductItemValues(1), quantity: "1", unit_cost_paid: "100", unit_cost_invoiced: "110" },
      "existing"
    );
    expect(different.price_discrepancy_note).toBe("Required when paid and invoiced prices differ.");

    const differentWithNote = validateAddItemForm(
      {
        ...emptyExistingProductItemValues(1),
        quantity: "1",
        unit_cost_paid: "100",
        unit_cost_invoiced: "110",
        price_discrepancy_note: "bulk discount",
      },
      "existing"
    );
    expect(differentWithNote.price_discrepancy_note).toBeUndefined();
  });
});
