import ScanPageClient from "./ScanPageClient";

export default async function PurchaseScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ScanPageClient purchaseId={Number(id)} />;
}
