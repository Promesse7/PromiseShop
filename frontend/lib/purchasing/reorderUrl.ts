// The one place the Reorder-action URL shape is built (dashboard low-stock
// table, product detail page) — a purchases-page link that auto-opens
// "New purchase" and, once a supplier is picked and it's created, prefills
// the add-item search with this product's name. See PurchasesPageClient
// (reads open/reorder_name) and PurchaseWorkspaceClient (reads prefill).
export function buildReorderUrl(productId: number, name: string): string {
  return `/purchases?open=new&reorder_product=${productId}&reorder_name=${encodeURIComponent(name)}`;
}
