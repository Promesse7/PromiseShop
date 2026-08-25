import { Card, CardKicker } from "@/components/ui/Card";
import type { Category } from "@/lib/types";

interface CatalogInfoCardProps {
  category: Category | undefined;
  brand: string | null;
  modelNumber: string | null;
  warrantyMonths: number;
  hasTrackedSerials: boolean;
}

export function CatalogInfoCard({ category, brand, modelNumber, warrantyMonths, hasTrackedSerials }: CatalogInfoCardProps) {
  return (
    <Card elevation="sm">
      <CardKicker>Catalog</CardKicker>
      <div className="flex justify-between text-sm">
        <span>Category</span>
        <span>{category?.name ?? "—"}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span>Brand / model</span>
        <span>
          {brand ?? "—"} · {modelNumber ?? "—"}
        </span>
      </div>
      <div className="flex justify-between text-sm">
        <span>Warranty</span>
        <span>{warrantyMonths} months</span>
      </div>
      <div className="flex justify-between text-sm">
        <span>Track serials</span>
        <span className={hasTrackedSerials ? "text-accent" : ""}>{hasTrackedSerials ? "On" : "Off"}</span>
      </div>
    </Card>
  );
}
