import type { ConsumptionPurpose, InternalConsumption, ShopAssetStatus } from "@/lib/types";

export const PURPOSE_LABELS: Record<ConsumptionPurpose, string> = {
  replacement: "Replacement",
  repair: "Repair",
  shop_setup: "Shop setup",
  other: "Other",
};

export const ASSET_STATUS_LABELS: Record<ShopAssetStatus, string> = {
  in_service: "In service",
  damaged: "Damaged",
  under_repair: "Under repair",
  retired: "Retired",
  returned_to_stock: "Returned to stock",
};

export const ASSET_STATUS_TAG: Record<ShopAssetStatus, "accent" | "outline" | "neutral"> = {
  in_service: "accent",
  under_repair: "outline",
  damaged: "neutral",
  retired: "neutral",
  returned_to_stock: "neutral",
};

/** Whole francs; null means the shop had no cost for the product at the time. */
export function formatValue(value: string | null | undefined): string {
  if (value == null) return "cost unknown";
  return `RWF ${Math.round(Number(value)).toLocaleString("en-US")}`;
}

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function consumptionsToCsv(rows: InternalConsumption[], showCost: boolean): string {
  const header = ["Date", "Product", "Barcode", "Quantity", "Purpose", "Reason", "Taken by", "Approved by"];
  if (showCost) header.push("Unit cost", "Value");
  const lines = rows.map((r) => {
    const cells: (string | number | null | undefined)[] = [
      r.created_at.slice(0, 10), r.product_name, r.product_barcode, r.quantity, PURPOSE_LABELS[r.purpose],
      r.reason, r.taken_by_name, r.approved_by_name,
    ];
    if (showCost) cells.push(r.unit_cost, r.total_value);
    return cells.map(csvCell).join(",");
  });
  return [header.join(","), ...lines].join("\n");
}
