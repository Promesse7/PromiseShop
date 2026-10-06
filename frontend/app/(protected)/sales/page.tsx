import { getSession } from "@/lib/auth";
import SalesPageClient from "./SalesPageClient";

export default async function SalesPage() {
  const session = await getSession();
  const canSeeAll = session?.role === "admin" || session?.role === "manager";
  return <SalesPageClient canSeeAll={canSeeAll} />;
}
