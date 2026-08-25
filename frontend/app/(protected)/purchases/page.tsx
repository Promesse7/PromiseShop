import { getSession } from "@/lib/auth";
import PurchasesPageClient from "./PurchasesPageClient";

export default async function PurchasesPage() {
  const session = await getSession();
  return <PurchasesPageClient role={session?.role ?? "sales_staff"} />;
}
