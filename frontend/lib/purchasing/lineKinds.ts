import type { PurchaseItem } from "@/lib/types";

/** Single units a line brings into stock (packs and bundles broken down). */
export function unitsOf(item: PurchaseItem): number {
  if (item.units_received != null) return item.units_received;
  if (item.line_kind === "bundle") {
    return (item.components ?? []).reduce((n, c) => n + item.quantity * c.qty_per_bundle, 0);
  }
  return item.quantity * (item.units_per_pack ?? 1);
}

export function totalUnits(items: PurchaseItem[]): number {
  return items.reduce((n, item) => n + unitsOf(item), 0);
}

/** "Decoder — 3 × pack of 24 = 72 units", "Kit — 2 bundles = 42 units", or the name. */
export function describeLine(item: PurchaseItem, productName: string | null): string {
  if (item.line_kind === "bundle") {
    const bundles = `${item.quantity} bundle${item.quantity === 1 ? "" : "s"}`;
    return `${item.bundle_name || "Bundle"} — ${bundles} = ${unitsOf(item)} units`;
  }
  const name = productName ?? `Product #${item.product}`;
  if (item.line_kind === "pack") {
    return `${name} — ${item.quantity} × pack of ${item.units_per_pack} = ${unitsOf(item)} units`;
  }
  return name;
}

export interface LabelInfo {
  name: string;
  barcode: string;
  retail_price: number;
}

export interface LabelRun extends LabelInfo {
  product: number;
  copies: number;
}

/** One label per received single unit, grouped by product (in product-id order). */
export function labelsForReceivedItems(
  items: PurchaseItem[],
  catalog: Map<number, LabelInfo>
): LabelRun[] {
  const copies = new Map<number, number>();
  const add = (product: number, units: number) => copies.set(product, (copies.get(product) ?? 0) + units);
  for (const item of items) {
    if (item.line_kind === "bundle") {
      for (const c of item.components ?? []) add(c.product, item.quantity * c.qty_per_bundle);
    } else if (item.product != null) {
      add(item.product, unitsOf(item));
    }
  }
  return [...copies.entries()]
    .sort(([a], [b]) => a - b)
    .map(([product, count]) => {
      const info = catalog.get(product);
      return {
        product,
        name: info?.name ?? `Product #${product}`,
        barcode: info?.barcode ?? "",
        retail_price: info?.retail_price ?? 0,
        copies: count,
      };
    });
}

function toCents(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Bundle price minus the allocations typed so far, as a fixed 2-decimal string. */
export function allocationRemaining(total: string, allocations: string[]): string {
  const left = toCents(total) - allocations.reduce((sum, a) => sum + toCents(a), 0);
  return (left / 100).toFixed(2);
}
