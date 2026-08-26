import { getSession } from "@/lib/auth";
import DashboardPageClient from "./DashboardPageClient";

export default async function DashboardPage() {
  const session = await getSession();
  return <DashboardPageClient role={session?.role ?? "admin"} />;
}
