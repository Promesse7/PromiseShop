import { getSession } from "@/lib/auth";
import ImportPageClient from "./ImportPageClient";

export default async function SetupImportPage() {
  const session = await getSession();
  return <ImportPageClient isAdmin={session?.role === "admin"} />;
}
