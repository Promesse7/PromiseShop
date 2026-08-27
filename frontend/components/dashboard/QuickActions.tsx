import { ShoppingCart, Truck, PackagePlus, ReceiptText } from "lucide-react";
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
        <ShoppingCart className="w-4 h-4" aria-hidden />
        New Sale
      </Button>
      <Button href="/purchases" variant="secondary">
        <Truck className="w-4 h-4" aria-hidden />
        New Purchase
      </Button>
      <Button href="/products" variant="secondary">
        <PackagePlus className="w-4 h-4" aria-hidden />
        Add Product
      </Button>
      {STRICT_ADMIN_ROLES.includes(role) && (
        <Button href="/expenses" variant="secondary">
          <ReceiptText className="w-4 h-4" aria-hidden />
          Add Expense
        </Button>
      )}
    </div>
  );
}
