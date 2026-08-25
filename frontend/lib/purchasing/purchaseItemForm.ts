export type AddItemMode = "existing" | "new";

export interface AddItemFormValues {
  product: number | "";
  category: number | "";
  name: string;
  brand: string;
  model_number: string;
  specifications: string;
  usage_instructions: string;
  warranty_months: string;
  reorder_level: string;
  selling_price: string;
  quantity: string;
  unit_cost_paid: string;
  unit_cost_invoiced: string;
  price_discrepancy_note: string;
}

export function emptyExistingProductItemValues(productId: number | ""): AddItemFormValues {
  return {
    product: productId,
    category: "",
    name: "",
    brand: "",
    model_number: "",
    specifications: "",
    usage_instructions: "",
    warranty_months: "",
    reorder_level: "",
    selling_price: "",
    quantity: "",
    unit_cost_paid: "",
    unit_cost_invoiced: "",
    price_discrepancy_note: "",
  };
}

export function emptyNewProductItemValues(name = ""): AddItemFormValues {
  return {
    product: "",
    category: "",
    name,
    brand: "",
    model_number: "",
    specifications: "",
    usage_instructions: "",
    warranty_months: "",
    reorder_level: "",
    selling_price: "",
    quantity: "",
    unit_cost_paid: "",
    unit_cost_invoiced: "",
    price_discrepancy_note: "",
  };
}

export interface AddItemPayload {
  product?: number;
  category?: number;
  name?: string;
  brand?: string;
  model_number?: string;
  specifications?: string;
  usage_instructions?: string;
  warranty_months?: number;
  reorder_level?: number;
  selling_price?: string;
  quantity: number;
  unit_cost_paid: string;
  unit_cost_invoiced: string;
  price_discrepancy_note: string;
}

export function buildAddItemPayload(values: AddItemFormValues, mode: AddItemMode): AddItemPayload {
  const base: AddItemPayload = {
    quantity: Number(values.quantity),
    unit_cost_paid: values.unit_cost_paid,
    unit_cost_invoiced: values.unit_cost_invoiced,
    price_discrepancy_note: values.price_discrepancy_note.trim(),
  };
  if (mode === "existing") {
    return { ...base, product: values.product === "" ? undefined : values.product };
  }
  return {
    ...base,
    category: values.category === "" ? undefined : values.category,
    name: values.name.trim(),
    brand: values.brand.trim(),
    model_number: values.model_number.trim(),
    specifications: values.specifications.trim(),
    usage_instructions: values.usage_instructions.trim(),
    warranty_months: values.warranty_months.trim() === "" ? undefined : Number(values.warranty_months),
    reorder_level: values.reorder_level.trim() === "" ? undefined : Number(values.reorder_level),
    selling_price: values.selling_price.trim() || undefined,
  };
}

export type AddItemFormErrors = Partial<
  Record<"product" | "category" | "name" | "selling_price" | "quantity" | "unit_cost_paid" | "unit_cost_invoiced" | "price_discrepancy_note", string>
>;

export function validateAddItemForm(values: AddItemFormValues, mode: AddItemMode): AddItemFormErrors {
  const errors: AddItemFormErrors = {};

  if (mode === "existing" && values.product === "") {
    errors.product = "Select a product.";
  }
  if (mode === "new") {
    if (values.category === "") errors.category = "Category is required.";
    if (!values.name.trim()) errors.name = "Product name is required.";
    if (!values.selling_price.trim()) errors.selling_price = "Selling price is required.";
  }

  const quantity = Number(values.quantity);
  if (!values.quantity.trim() || !Number.isFinite(quantity) || quantity < 1) {
    errors.quantity = "Quantity must be at least 1.";
  }

  const paid = Number(values.unit_cost_paid);
  if (!values.unit_cost_paid.trim() || !Number.isFinite(paid) || paid < 0) {
    errors.unit_cost_paid = "Buy price (paid) is required.";
  }

  const invoiced = Number(values.unit_cost_invoiced);
  if (!values.unit_cost_invoiced.trim() || !Number.isFinite(invoiced) || invoiced < 0) {
    errors.unit_cost_invoiced = "Buy price (invoiced) is required.";
  }

  if (
    values.unit_cost_paid.trim() &&
    values.unit_cost_invoiced.trim() &&
    paid !== invoiced &&
    !values.price_discrepancy_note.trim()
  ) {
    errors.price_discrepancy_note = "Required when paid and invoiced prices differ.";
  }

  return errors;
}
