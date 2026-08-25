import { Card, CardKicker } from "@/components/ui/Card";
import type { Inventory } from "@/lib/types";

interface StockCardProps {
  inventory: Inventory | undefined;
}

export function StockCard({ inventory }: StockCardProps) {
  return (
    <Card elevation="sm">
      <CardKicker>Stock</CardKicker>
      {inventory ? (
        <>
          <div className="flex justify-between text-sm">
            <span>In stock</span>
            <span>{inventory.quantity_in_stock}</span>
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
        </>
      ) : (
        <p className="text-sm text-text/50">Not yet received</p>
      )}
    </Card>
  );
}
