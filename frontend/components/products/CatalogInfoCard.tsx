import Link from "next/link";
import { Card, CardKicker } from "@/components/ui/Card";
import type { Category } from "@/lib/types";

const TAX_LABELS: Record<"A" | "B", string> = {
  A: "Exempt (0%)",
  B: "Standard (18%)",
};

interface CatalogInfoCardProps {
  productId: number;
  category: Category | undefined;
  brand: string | null;
  modelNumber: string | null;
  warrantyMonths: number;
  unitCount: number;
  description: string | null;
  unit: string;
  taxCategory: "A" | "B";
  createdAt: string;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function CatalogInfoCard({
  productId, category, brand, modelNumber, warrantyMonths, unitCount, description, unit, taxCategory, createdAt,
}: CatalogInfoCardProps) {
  return (
    <Card elevation="sm">
      <CardKicker>Catalog</CardKicker>
      <div className="flex justify-between text-sm">
        <span>Category</span>
        <span className="text-right">
          {category?.name ?? "—"}
          {category?.description && <div className="text-xs text-text/50">{category.description}</div>}
        </span>
      </div>
      <div className="flex justify-between text-sm">
        <span>Brand / model</span>
        <span>
          {brand ?? "—"} · {modelNumber ?? "—"}
        </span>
      </div>
      <div className="flex justify-between text-sm">
        <span>Description</span>
        <span className="text-right max-w-[60%]">{description || "—"}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span>Unit</span>
        <span>{unit}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span>VAT</span>
        <span>{TAX_LABELS[taxCategory]}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span>Warranty</span>
        <span>{warrantyMonths} months</span>
      </div>
      <div className="flex justify-between text-sm">
        <span>Track serials</span>
        {unitCount > 0 ? (
          <Link href={`/stock?product=${productId}`} className="text-accent">
            On → {unitCount} units
          </Link>
        ) : (
          <span>Off</span>
        )}
      </div>
      <div className="flex justify-between text-sm">
        <span>Added</span>
        <span>{formatDate(createdAt)}</span>
      </div>
    </Card>
  );
}
