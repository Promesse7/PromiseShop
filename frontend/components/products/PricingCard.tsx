import { Card, CardKicker } from "@/components/ui/Card";
import type { ProductPricing } from "@/lib/types";

interface PricingCardProps {
  currentPricing: ProductPricing | undefined;
}

export function PricingCard({ currentPricing }: PricingCardProps) {
  if (!currentPricing) {
    return (
      <Card elevation="sm">
        <CardKicker>Current pricing · Admin only</CardKicker>
        <p className="text-sm text-text/50">No price set</p>
      </Card>
    );
  }

  const retail = Number(currentPricing.retail_price);
  const wholesale = currentPricing.wholesale_price != null ? Number(currentPricing.wholesale_price) : null;
  const margin = wholesale != null && retail > 0 ? (((retail - wholesale) / retail) * 100).toFixed(1) : null;
  const effectiveDate = new Date(currentPricing.effective_date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <Card elevation="sm">
      <CardKicker>Current pricing · Admin only</CardKicker>
      <div className="flex justify-between text-sm">
        <span>Retail</span>
        <span>RWF {retail.toLocaleString()}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span>Wholesale</span>
        <span>{wholesale != null ? `RWF ${wholesale.toLocaleString()}` : "Not set"}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span>Margin</span>
        <span className="text-accent-300">{margin != null ? `${margin}%` : "—"}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span>Effective since</span>
        <span>{effectiveDate}</span>
      </div>
    </Card>
  );
}
