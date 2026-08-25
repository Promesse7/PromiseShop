import type { PosProduct } from "@/lib/types";
import type { PosCatalog } from "./usePosCatalog";

export function findByBarcode(catalog: PosCatalog, barcode: string): PosProduct | undefined {
  return catalog.byBarcode.get(barcode.trim());
}

export function searchCatalog(catalog: PosCatalog, query: string): PosProduct[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return catalog.all.filter(
    (p) =>
      p.barcode.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      (p.brand ?? "").toLowerCase().includes(q) ||
      (p.model_number ?? "").toLowerCase().includes(q)
  );
}
