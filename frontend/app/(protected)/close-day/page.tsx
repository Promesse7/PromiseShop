import { getSession } from "@/lib/auth";
import CloseDayPageClient from "./CloseDayPageClient";

export default async function CloseDayPage() {
  const session = await getSession();
  return <CloseDayPageClient role={session?.role ?? "sales_staff"} />;
}
