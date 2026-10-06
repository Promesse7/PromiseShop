import ProductMoneyPageClient from "./ProductMoneyPageClient";

export default async function ProductMoneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductMoneyPageClient productId={Number(id)} />;
}
