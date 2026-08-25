import PurchaseWorkspaceClient from "./PurchaseWorkspaceClient";

export default async function PurchaseWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PurchaseWorkspaceClient purchaseId={Number(id)} />;
}
