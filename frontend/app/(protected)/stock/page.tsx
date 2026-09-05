import { getSession } from "@/lib/auth";
import StockPageClient from "./StockPageClient";

export default async function StockPage() {
  const session = await getSession();
  return <StockPageClient role={session?.role ?? "sales_staff"} />;
}
