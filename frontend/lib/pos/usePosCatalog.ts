import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAllPages } from "@/lib/api-client";
import type { Product, Category, ProductPricing, Inventory, PosProduct, ProductBarcodeAlias } from "@/lib/types";

export interface PosCatalog {
  all: PosProduct[];
  byBarcode: Map<string, PosProduct>;
  isLoading: boolean;
  isError: boolean;
}

export function usePosCatalog(): PosCatalog {
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

  // Extra barcodes (a merged duplicate's old label) — optional: the till works without them.
  const aliases = useQuery({
    queryKey: ["product-barcode-aliases"],
    queryFn: () => fetchAllPages<ProductBarcodeAlias>("product-barcode-aliases/"),
  });

  const isLoading = products.isLoading || categories.isLoading || pricing.isLoading || inventory.isLoading;
  const isError = products.isError || categories.isError || pricing.isError || inventory.isError;

  const all = useMemo((): PosProduct[] => {
    if (!products.data || !categories.data || !pricing.data || !inventory.data) return [];

    const categoryNameById = new Map(categories.data.map((c) => [c.category_id, c.name]));
    const priceByProductId = new Map(pricing.data.map((p) => [p.product, parseFloat(p.retail_price)]));
    const stockByProductId = new Map(inventory.data.map((i) => [i.product, i.quantity_in_stock]));

    return products.data
      .filter((product) => product.is_active !== false)
      .map((product) => ({
        product_id: product.product_id,
        barcode: product.barcode,
        name: product.name,
        brand: product.brand,
        model_number: product.model_number,
        category_name: categoryNameById.get(product.category) ?? "",
        retail_price: priceByProductId.get(product.product_id) ?? 0,
        quantity_in_stock: stockByProductId.get(product.product_id) ?? 0,
      }));
  }, [products.data, categories.data, pricing.data, inventory.data]);

  const byBarcode = useMemo(() => {
    const map = new Map(all.map((p) => [p.barcode, p]));
    const byId = new Map(all.map((p) => [p.product_id, p]));
    for (const alias of aliases.data ?? []) {
      const product = byId.get(alias.product);
      // A product's own barcode always wins over an alias of the same text.
      if (product && !map.has(alias.barcode)) map.set(alias.barcode, product);
    }
    return map;
  }, [all, aliases.data]);

  return { all, byBarcode, isLoading, isError };
}
