import { getSession } from "@/lib/auth";
import NotificationsPageClient from "./NotificationsPageClient";

export default async function NotificationsPage() {
  const session = await getSession();
  return <NotificationsPageClient role={session?.role ?? "sales_staff"} />;
}
