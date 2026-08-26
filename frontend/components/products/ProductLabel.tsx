import { Barcode } from "@/components/ui/Barcode";

interface ProductLabelProps {
  product: {
    name: string;
    barcode: string;
    retail_price: number;
  };
}

export function ProductLabel({ product }: ProductLabelProps) {
  return (
    <div className="w-[63.5mm] h-[33.9mm] flex flex-col items-center justify-center gap-0.5 p-1 border border-dashed border-neutral-300 print:border-none overflow-hidden">
      <span className="text-xs font-medium text-center truncate w-full">{product.name}</span>
      <span className="text-xs">RWF {product.retail_price.toLocaleString()}</span>
      <Barcode value={product.barcode} height={28} fontSize={10} />
    </div>
  );
}
