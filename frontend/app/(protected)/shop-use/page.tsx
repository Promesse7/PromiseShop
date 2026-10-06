import { getSession } from "@/lib/auth";
import ShopUsePageClient from "./ShopUsePageClient";

export default async function ShopUsePage() {
  const session = await getSession();
  return <ShopUsePageClient role={session?.role ?? "sales_staff"} />;
}
