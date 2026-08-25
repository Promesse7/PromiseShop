import { getSession } from "@/lib/auth";
import { PosCheckout } from "@/components/pos/PosCheckout";

export default async function CheckoutPage() {
  const session = await getSession();
  return <PosCheckout servedBy={session?.username ?? ""} />;
}
