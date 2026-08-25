import UnitDetailPageClient from "./UnitDetailPageClient";

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <UnitDetailPageClient unitId={Number(id)} />;
}
