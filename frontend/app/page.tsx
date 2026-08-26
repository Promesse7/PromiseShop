import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import type { EmployeeRole } from "@/lib/types";

const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];

export default async function Home() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  redirect(ADMIN_ROLES.includes(session.role) ? "/dashboard" : "/checkout");
}
