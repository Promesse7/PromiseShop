import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAllPages } from "@/lib/api-client";
import type { Product, Inventory, EquipmentUnit } from "@/lib/types";

export interface StockOverviewRow {
  product_id: number;
  name: string;
  quantity_in_stock: number;
  quantity_in_use: number;
  quantity_damaged: number;
  storage_location: string | null;
  flag: "ok" | "low_stock" | "out_of_stock";
  unit_count: number;
}

export interface StockOverview {
  rows: StockOverviewRow[];
  isLoading: boolean;
  isError: boolean;
}

function deriveFlag(quantityInStock: number, reorderLevel: number): StockOverviewRow["flag"] {
  if (quantityInStock === 0) return "out_of_stock";
  if (quantityInStock <= reorderLevel) return "low_stock";
  return "ok";
}

export function useStockOverview(): StockOverview {
  const inventory = useQuery({
    queryKey: ["inventory"],
    queryFn: () => fetchAllPages<Inventory>("inventory/"),
  });
  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => fetchAllPages<Product>("products/"),
  });
  const units = useQuery({
    queryKey: ["equipment-units"],
    queryFn: () => fetchAllPages<EquipmentUnit>("equipment-units/"),
  });

  const isLoading = inventory.isLoading || products.isLoading || units.isLoading;
  const isError = inventory.isError || products.isError || units.isError;

  const rows = useMemo((): StockOverviewRow[] => {
    if (!inventory.data || !products.data || !units.data) return [];

    const productById = new Map(products.data.map((p) => [p.product_id, p]));
    const unitCountByProductId = new Map<number, number>();
    for (const unit of units.data) {
      unitCountByProductId.set(unit.product, (unitCountByProductId.get(unit.product) ?? 0) + 1);
    }

    return inventory.data
      .map((inv): StockOverviewRow | null => {
        const product = productById.get(inv.product);
        if (!product) return null;
        return {
          product_id: product.product_id,
          name: product.name,
          quantity_in_stock: inv.quantity_in_stock,
          quantity_in_use: inv.quantity_in_use,
          quantity_damaged: inv.quantity_damaged,
          storage_location: inv.storage_location,
          flag: deriveFlag(inv.quantity_in_stock, product.reorder_level),
          unit_count: unitCountByProductId.get(product.product_id) ?? 0,
        };
      })
      .filter((row): row is StockOverviewRow => row !== null);
  }, [inventory.data, products.data, units.data]);

  return { rows, isLoading, isError };
}
