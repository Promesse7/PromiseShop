import { getSession } from "@/lib/auth";
import CustomerDetailPageClient from "./CustomerDetailPageClient";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const canManage = session?.role === "admin" || session?.role === "manager";
  return <CustomerDetailPageClient customerId={Number(id)} canManage={canManage} />;
}
