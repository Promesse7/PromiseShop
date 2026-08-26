import { Barcode } from "@/components/ui/Barcode";

interface UnitLabelProps {
  productName: string;
  serialNumber: string;
}

export function UnitLabel({ productName, serialNumber }: UnitLabelProps) {
  return (
    <div className="w-[63.5mm] h-[33.9mm] flex flex-col items-center justify-center gap-0.5 p-1 border border-dashed border-neutral-300 print:border-none overflow-hidden">
      <span className="text-xs font-medium text-center truncate w-full">{productName}</span>
      <Barcode value={serialNumber} height={28} fontSize={10} />
    </div>
  );
}
