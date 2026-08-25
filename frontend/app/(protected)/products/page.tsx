import { getSession } from "@/lib/auth";
import ProductsPageClient from "./ProductsPageClient";

export default async function ProductsPage() {
  const session = await getSession();
  return <ProductsPageClient role={session?.role ?? "sales_staff"} />;
}
