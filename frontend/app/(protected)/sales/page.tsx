import { getSession } from "@/lib/auth";
import { salesFiltersFromParams } from "@/lib/sales/useSalesHistory";
import SalesPageClient from "./SalesPageClient";

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  const canSeeAll = session?.role === "admin" || session?.role === "manager";
  // Dashboard leakage cards link here with filters already set (e.g. ?has_discount=true).
  const initialFilters = salesFiltersFromParams(await searchParams);
  return <SalesPageClient canSeeAll={canSeeAll} initialFilters={initialFilters} />;
}
