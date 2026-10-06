import { getSession } from "@/lib/auth";
import AssetDetailPageClient from "./AssetDetailPageClient";

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  return <AssetDetailPageClient assetId={Number(id)} role={session?.role ?? "sales_staff"} />;
}
