import { getSession } from "@/lib/auth";
import ExpensesPageClient from "./ExpensesPageClient";

export default async function ExpensesPage() {
  const session = await getSession();
  return <ExpensesPageClient isAdmin={session?.role === "admin"} />;
}
