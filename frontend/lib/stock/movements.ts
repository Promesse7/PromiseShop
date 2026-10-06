import type { StockBucket, StockMovement, StockMovementType } from "@/lib/types";

export const MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  purchase_receipt: "Purchase received",
  purchase_cancel: "Purchase cancelled",
  sale: "Sale",
  sale_return: "Sale return",
  sale_void: "Sale void",
  adjust_count: "Count correction",
  to_damaged: "To damaged",
  from_damaged: "From damaged",
  to_in_use: "To in use",
  from_in_use: "From in use",
  internal_consumption: "Used internally",
  to_shop_asset: "Made shop asset",
  opening: "Opening stock",
  merge_in: "Merged in",
  merge_out: "Merged out",
  bundle_breakdown: "Bundle breakdown",
};

export const BUCKET_LABELS: Record<StockBucket, string> = {
  in_stock: "In stock",
  in_use: "In use",
  damaged: "Damaged",
};

export interface MovementFilters {
  product?: number | null;
  type?: StockMovementType | "";
  bucket?: StockBucket | "";
  from?: string;
  to?: string;
}

/** Query string for GET stock/movements/, skipping empty filters. */
export function movementsQuery(filters: MovementFilters, pageSize: number): string {
  const params = new URLSearchParams();
  if (filters.product != null) params.set("product", String(filters.product));
  if (filters.type) params.set("type", filters.type);
  if (filters.bucket) params.set("bucket", filters.bucket);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("page_size", String(pageSize));
  return params.toString();
}

export function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV of ledger rows; the unit cost column only when the viewer may see cost. */
export function movementsToCsv(rows: StockMovement[], showCost: boolean): string {
  const header = ["Date", "Product", "Type", "Bucket", "Change", "Balance after"];
  if (showCost) header.push("Unit cost");
  header.push("By", "Reason");
  const lines = rows.map((row) => {
    const cells: (string | number | null | undefined)[] = [
      row.created_at,
      row.product_name,
      MOVEMENT_TYPE_LABELS[row.movement_type] ?? row.movement_type,
      BUCKET_LABELS[row.bucket] ?? row.bucket,
      row.quantity_delta,
      row.balance_after,
    ];
    if (showCost) cells.push(row.unit_cost ?? "");
    cells.push(row.created_by_name ?? "System", row.reason);
    return cells.map(csvCell).join(",");
  });
  return [header.join(","), ...lines].join("\n");
}
