import { Button } from "@/components/ui/Button";
import type { EmployeeRole } from "@/lib/types";

const STRICT_ADMIN_ROLES: EmployeeRole[] = ["admin"];

interface QuickActionsProps {
  role: EmployeeRole;
}

export function QuickActions({ role }: QuickActionsProps) {
  return (
    <div className="flex gap-2 flex-wrap mb-4">
      <Button href="/checkout" variant="secondary">
        New Sale
      </Button>
      <Button href="/purchases" variant="secondary">
        New Purchase
      </Button>
      <Button href="/products" variant="secondary">
        Add Product
      </Button>
      {STRICT_ADMIN_ROLES.includes(role) && (
        <Button href="/expenses" variant="secondary">
          Add Expense
        </Button>
      )}
    </div>
  );
}
