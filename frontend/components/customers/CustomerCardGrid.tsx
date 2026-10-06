import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import type { Customer } from "@/lib/types";

interface CustomerCardGridProps {
  customers: Customer[];
  onEdit: (customer: Customer) => void;
}

export function CustomerCardGrid({ customers, onEdit }: CustomerCardGridProps) {
  if (customers.length === 0) {
    return <p className="text-sm text-text/50">No customers found</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {customers.map((c) => (
        <Card key={c.customer_id} elevation="sm" className="h-full">
          <CardTitle>{c.name ?? "—"}</CardTitle>
          <div className="flex flex-col gap-0.5 text-sm text-text/70">
            <span>{c.phone ?? "—"}</span>
            <span>{c.email ?? "—"}</span>
            {Number(c.balance ?? 0) > 0 && (
              <span className="text-amber-500">Owes RWF {Number(c.balance).toLocaleString()}</span>
            )}
          </div>
          <div className="mt-auto flex gap-2">
            <Link href={`/customers/${c.customer_id}`} className="text-xs text-accent self-center">
              Open →
            </Link>
            <Button variant="ghost" className="text-xs" onClick={() => onEdit(c)}>
              Edit
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
