import { Card, CardKicker } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { Inventory } from "@/lib/types";

interface StockCardProps {
  inventory: Inventory | undefined;
  reorderLevel: number;
  onAdjust?: () => void;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function StockCard({ inventory, reorderLevel, onAdjust }: StockCardProps) {
  return (
    <Card elevation="sm">
      <div className="flex items-start">
        <CardKicker>Stock</CardKicker>
        {inventory && onAdjust && (
          <Button variant="ghost" className="ml-auto" onClick={onAdjust}>
            Adjust stock
          </Button>
        )}
      </div>
      {inventory ? (
        <>
          <div className="flex justify-between text-sm">
            <span>In stock</span>
            <span>
              <span>{inventory.quantity_in_stock}</span>{" "}
              <span className="text-xs text-text/50">reorder at {reorderLevel}</span>
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span>In use (demo)</span>
            <span>{inventory.quantity_in_use}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Damaged</span>
            <span>{inventory.quantity_damaged}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Location</span>
            <span>{inventory.storage_location ?? "—"}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Last changed</span>
            <span>{formatDate(inventory.last_updated)}</span>
          </div>
        </>
      ) : (
        <p className="text-sm text-text/50">Not yet received</p>
      )}
    </Card>
  );
}
