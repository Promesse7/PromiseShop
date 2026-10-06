import { getSession } from "@/lib/auth";
import ProductsPageClient from "./ProductsPageClient";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  return <ProductsPageClient role={session?.role ?? "sales_staff"} openNew={params.new === "1"} />;
}
