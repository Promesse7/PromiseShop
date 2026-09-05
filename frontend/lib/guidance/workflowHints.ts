import type { CatalogProduct } from "@/lib/products/useCatalogProducts";
import type { PurchaseListRow } from "@/lib/purchasing/usePurchases";

export interface WorkflowHint {
  key: string;
  // "setup": first-run steps shown until the first purchase is received.
  // "todo": ongoing things left half-done, each dismissible until its count changes.
  kind: "setup" | "todo";
  label: string;
  href: string;
  done?: boolean;
  // Changes when the underlying situation changes, so a dismissed hint comes back.
  signature: string;
}

interface DeriveInput {
  products: CatalogProduct[];
  categoryCount: number;
  purchases: PurchaseListRow[];
  now: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm;
}

// Pure so it can be unit-tested without React; the hook feeds it data the app
// already loads for the catalog and purchases pages.
export function deriveWorkflowHints({ products, categoryCount, purchases, now }: DeriveInput): WorkflowHint[] {
  const hasReceived = purchases.some((p) => p.status === "received");

  if (!hasReceived) {
    const setup = (key: string, label: string, href: string, done: boolean): WorkflowHint => ({
      key, kind: "setup", label, href, done, signature: key,
    });
    return [
      setup("setup-category", "Add your first category", "/products", categoryCount > 0),
      setup("setup-product", "Add your first product", "/products", products.length > 0),
      setup("setup-price", "Set a selling price on a product", "/products", products.some((p) => p.has_price)),
      setup("setup-purchase", "Record and receive your first purchase", "/purchases?open=new", false),
    ];
  }

  const hints: WorkflowHint[] = [];
  const active = products.filter((p) => p.is_active);

  const unpriced = active.filter((p) => !p.has_price).length;
  if (unpriced > 0) {
    hints.push({
      key: "needs-price",
      kind: "todo",
      label: `${unpriced} ${plural(unpriced, "product needs", "products need")} a selling price`,
      href: "/products",
      signature: String(unpriced),
    });
  }

  const drafts = purchases.filter((p) => p.status === "draft");
  if (drafts.length > 0) {
    const oldest = Math.min(...drafts.map((p) => Date.parse(p.purchase_date)));
    const days = Math.floor((now.getTime() - oldest) / DAY_MS);
    const age = days >= 1 ? ` — oldest ${days} ${plural(days, "day", "days")} ago` : "";
    hints.push({
      key: "draft-purchases",
      kind: "todo",
      label: `${drafts.length} draft ${plural(drafts.length, "purchase", "purchases")} waiting to be received${age}`,
      href: "/purchases",
      signature: String(drafts.length),
    });
  }

  const neverReceived = active.filter((p) => !p.has_inventory).length;
  if (neverReceived > 0) {
    hints.push({
      key: "never-received",
      kind: "todo",
      label: `${neverReceived} ${plural(neverReceived, "product", "products")} never received into stock`,
      href: "/purchases?open=new",
      signature: String(neverReceived),
    });
  }

  return hints;
}
