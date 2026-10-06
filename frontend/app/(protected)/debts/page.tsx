import { getSession } from "@/lib/auth";
import DebtsPageClient from "./DebtsPageClient";

export default async function DebtsPage() {
  const session = await getSession();
  const canView = session?.role === "admin" || session?.role === "manager";
  return <DebtsPageClient canView={canView} />;
}
