import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAllPages } from "@/lib/api-client";
import type { Product, Category, ProductPricing, Inventory } from "@/lib/types";

export interface CatalogProduct {
  product_id: number;
  name: string;
  brand: string | null;
  model_number: string | null;
  barcode: string;
  category_id: number;
  category_name: string;
  retail_price: number;
  wholesale_price: number | null;
  quantity_in_stock: number;
  reorder_level: number;
  status: "ok" | "low_stock" | "out_of_stock";
}

export interface CatalogProducts {
  all: CatalogProduct[];
  categories: Category[];
  isLoading: boolean;
  isError: boolean;
}

function deriveStatus(quantityInStock: number, reorderLevel: number): CatalogProduct["status"] {
  if (quantityInStock === 0) return "out_of_stock";
  if (quantityInStock <= reorderLevel) return "low_stock";
  return "ok";
}

export function useCatalogProducts(): CatalogProducts {
  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => fetchAllPages<Product>("products/"),
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => fetchAllPages<Category>("categories/"),
  });
  const pricing = useQuery({
    queryKey: ["product-pricing", "current"],
    queryFn: () => fetchAllPages<ProductPricing>("product-pricing/?is_current=true"),
  });
  const inventory = useQuery({
    queryKey: ["inventory"],
    queryFn: () => fetchAllPages<Inventory>("inventory/"),
  });

  const isLoading = products.isLoading || categories.isLoading || pricing.isLoading || inventory.isLoading;
  const isError = products.isError || categories.isError || pricing.isError || inventory.isError;

  const all = useMemo((): CatalogProduct[] => {
    if (!products.data || !categories.data || !pricing.data || !inventory.data) return [];

    const categoryNameById = new Map(categories.data.map((c) => [c.category_id, c.name]));
    const priceByProductId = new Map(
      pricing.data.map((p) => [
        p.product,
        {
          retail: parseFloat(p.retail_price),
          wholesale: p.wholesale_price !== undefined ? parseFloat(p.wholesale_price) : null,
        },
      ])
    );
    const stockByProductId = new Map(inventory.data.map((i) => [i.product, i.quantity_in_stock]));

    return products.data.map((product): CatalogProduct => {
      const price = priceByProductId.get(product.product_id);
      const quantity_in_stock = stockByProductId.get(product.product_id) ?? 0;
      return {
        product_id: product.product_id,
        name: product.name,
        brand: product.brand,
        model_number: product.model_number,
        barcode: product.barcode,
        category_id: product.category,
        category_name: categoryNameById.get(product.category) ?? "",
        retail_price: price?.retail ?? 0,
        wholesale_price: price?.wholesale ?? null,
        quantity_in_stock,
        reorder_level: product.reorder_level,
        status: deriveStatus(quantity_in_stock, product.reorder_level),
      };
    });
  }, [products.data, categories.data, pricing.data, inventory.data]);

  return { all, categories: categories.data ?? [], isLoading, isError };
}
