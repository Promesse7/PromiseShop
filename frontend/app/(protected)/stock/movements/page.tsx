import { getSession } from "@/lib/auth";
import StockMovementsPageClient from "./StockMovementsPageClient";

export default async function StockMovementsPage() {
  const session = await getSession();
  return <StockMovementsPageClient role={session?.role ?? "sales_staff"} />;
}
