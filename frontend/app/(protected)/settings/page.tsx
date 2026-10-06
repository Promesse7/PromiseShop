import { getSession } from "@/lib/auth";
import SettingsPageClient from "./SettingsPageClient";

export default async function SettingsPage() {
  const session = await getSession();
  return <SettingsPageClient isAdmin={session?.role === "admin"} />;
}
