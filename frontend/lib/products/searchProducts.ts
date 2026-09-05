import { normalizeName } from "./normalizeName";
import type { Product } from "@/lib/types";

// The one catalog-matching rule shared by every "type a product" entry point
// (single add-to-purchase, bulk add-to-purchase). Substring on the normalized
// name or on the barcode, so "sc" surfaces every "Scales …" variant instead of
// forcing the user to type a full name before anything matches.
export function searchProducts(products: Product[], query: string, limit = 8): Product[] {
  const q = normalizeName(query);
  if (!q) return [];
  const matches: Product[] = [];
  for (const p of products) {
    if (normalizeName(p.name).includes(q) || p.barcode.toLowerCase().includes(q)) {
      matches.push(p);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

// A whole-name (or whole-barcode) hit — what a typed full name or a scanner
// produces — locks a row to that product without needing a click.
export function findExactProduct(products: Product[], query: string): Product | undefined {
  const q = normalizeName(query);
  if (!q) return undefined;
  return products.find((p) => normalizeName(p.name) === q || p.barcode.toLowerCase() === q);
}
