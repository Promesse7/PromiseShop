import { getSession } from "@/lib/auth";
import PurchaseWorkspaceClient from "./PurchaseWorkspaceClient";

export default async function PurchaseWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  return <PurchaseWorkspaceClient purchaseId={Number(id)} role={session?.role ?? "sales_staff"} />;
}
