import type { ProductSearchResult } from "@/lib/types";

/** What a bulk purchase row points at. `null` = nothing chosen yet (can't be saved). */
export type BulkRowChoice =
  | { kind: "existing"; product: Pick<ProductSearchResult, "product_id" | "name" | "barcode"> & Partial<ProductSearchResult> }
  | { kind: "new" }
  | null;

export interface BulkRow {
  id: string;
  /** What was typed in the product cell (also the new product's name). */
  name: string;
  choice: BulkRowChoice;
  category: number | "";
  quantity: string;
  unit_cost_paid: string;
  unit_cost_invoiced: string;
  selling_price: string;
  price_discrepancy_note: string;
  error?: string;
  /** Set on rows that came from a paste, until the user touches them. */
  pasted?: boolean;
}

export interface BulkRowPayload {
  product?: number;
  new_product?: { category: number; name: string; selling_price: string };
  quantity: number;
  unit_cost_paid: string;
  unit_cost_invoiced: string;
  price_discrepancy_note: string;
}

export interface PastedRow {
  query: string;
  quantity: string;
  paid: string;
  invoiced: string;
}

export const DID_YOU_MEAN_SCORE = 0.6;

export function newRowId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `row-${Math.random().toString(36).slice(2)}`;
}

export function emptyBulkRow(): BulkRow {
  return {
    id: newRowId(),
    name: "",
    choice: null,
    category: "",
    quantity: "",
    unit_cost_paid: "",
    unit_cost_invoiced: "",
    selling_price: "",
    price_discrepancy_note: "",
  };
}

export function normaliseText(value: string): string {
  return value.toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}

/** Auto-select only on an exact barcode/alias or exact normalised-name hit. */
export function autoMatch(results: ProductSearchResult[]): ProductSearchResult | null {
  const top = results[0];
  return top && (top.match === "barcode" || top.match === "exact_name") ? top : null;
}

/** The strongest close match, if any is close enough to warn before creating a duplicate. */
export function didYouMean(results: ProductSearchResult[]): ProductSearchResult | null {
  let best: ProductSearchResult | null = null;
  for (const r of results) {
    if (r.score >= DID_YOU_MEAN_SCORE && (!best || r.score > best.score)) best = r;
  }
  return best;
}

export function isBlankRow(row: BulkRow): boolean {
  return (
    row.choice === null &&
    row.name.trim() === "" &&
    row.quantity.trim() === "" &&
    row.unit_cost_paid.trim() === "" &&
    row.unit_cost_invoiced.trim() === ""
  );
}

function isMoney(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
}

/** First problem with a row, or null when it can be saved. */
export function validateBulkRow(row: BulkRow): string | null {
  if (row.choice === null) return "Choose a product from the list, or create a new one.";
  if (row.choice.kind === "new") {
    if (row.name.trim() === "") return "Enter the new product's name.";
    if (row.category === "") return "Pick a category for the new product.";
    if (!isMoney(row.selling_price)) return "Enter a selling price for the new product.";
  }
  const qty = Number(row.quantity);
  if (row.quantity.trim() === "" || !Number.isInteger(qty) || qty < 1) {
    return "Quantity must be a whole number of at least 1.";
  }
  if (!isMoney(row.unit_cost_paid)) return "Enter the buying price paid.";
  if (!isMoney(row.unit_cost_invoiced)) return "Enter the invoiced buying price.";
  if (Number(row.unit_cost_paid) !== Number(row.unit_cost_invoiced) && row.price_discrepancy_note.trim() === "") {
    return "Paid and invoiced differ — add a discrepancy note.";
  }
  return null;
}

export function buildBulkPayload(row: BulkRow): BulkRowPayload {
  const common = {
    quantity: Number(row.quantity),
    unit_cost_paid: row.unit_cost_paid.trim(),
    unit_cost_invoiced: row.unit_cost_invoiced.trim(),
    price_discrepancy_note: row.price_discrepancy_note.trim(),
  };
  if (row.choice?.kind === "existing") return { product: row.choice.product.product_id, ...common };
  return {
    new_product: { category: Number(row.category), name: row.name.trim(), selling_price: row.selling_price.trim() },
    ...common,
  };
}

function cleanNumber(value: string | undefined): string {
  return (value ?? "").replace(/[\s,]/g, "");
}

/**
 * Tab-separated text copied from Excel: name-or-barcode, qty, paid, invoiced.
 * Blank lines and a header row (non-numeric quantity) are skipped; a missing
 * invoiced column means "same as paid".
 */
export function parsePastedRows(text: string): PastedRow[] {
  const rows: PastedRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const [query = "", quantity, paid, invoiced] = line.split("\t");
    const qty = cleanNumber(quantity);
    if (query.trim() === "" || (qty !== "" && !Number.isFinite(Number(qty)))) continue;
    const paidClean = cleanNumber(paid);
    rows.push({
      query: query.trim(),
      quantity: qty,
      paid: paidClean,
      invoiced: cleanNumber(invoiced) || paidClean,
    });
  }
  return rows;
}
