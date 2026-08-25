import { getSession } from "@/lib/auth";
import EmployeesPageClient from "./EmployeesPageClient";

export default async function EmployeesPage() {
  const session = await getSession();
  return <EmployeesPageClient isAdmin={session?.role === "admin"} />;
}
