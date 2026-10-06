import { getSession } from "@/lib/auth";
import SaleDetailPageClient from "./SaleDetailPageClient";

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const canManage = session?.role === "admin" || session?.role === "manager";
  return <SaleDetailPageClient saleId={Number(id)} canManage={canManage} />;
}
