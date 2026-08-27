import { Button } from "@/components/ui/Button";
import { Card, CardTitle, CardMeta } from "@/components/ui/Card";
import type { Supplier } from "@/lib/types";

interface SupplierCardGridProps {
  suppliers: Supplier[];
  onEdit: (supplier: Supplier) => void;
}

export function SupplierCardGrid({ suppliers, onEdit }: SupplierCardGridProps) {
  if (suppliers.length === 0) {
    return <p className="text-sm text-text/50">No suppliers found</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {suppliers.map((s) => (
        <Card key={s.supplier_id} elevation="sm" className="h-full">
          <CardTitle>{s.name}</CardTitle>
          {s.address && <CardMeta>{s.address}</CardMeta>}
          <div className="flex flex-col gap-0.5 text-sm text-text/70">
            <span>{s.contact_person ?? "—"}</span>
            <span>
              {s.phone ?? "—"} · {s.email ?? "—"}
            </span>
          </div>
          <Button variant="ghost" className="mt-auto self-start text-xs" onClick={() => onEdit(s)}>
            Edit
          </Button>
        </Card>
      ))}
    </div>
  );
}
