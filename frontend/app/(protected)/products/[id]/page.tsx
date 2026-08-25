import { getSession } from "@/lib/auth";
import ProductDetailPageClient from "./ProductDetailPageClient";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  return <ProductDetailPageClient productId={Number(id)} role={session?.role ?? "sales_staff"} />;
}
