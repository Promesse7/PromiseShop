import { getSession } from "@/lib/auth";
import SuppliersPageClient from "./SuppliersPageClient";

export default async function SuppliersPage() {
  const session = await getSession();
  const canEdit = session?.role === "admin" || session?.role === "manager";
  return <SuppliersPageClient canEdit={canEdit} />;
}
