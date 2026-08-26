"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeProps {
  value: string;
  height?: number;
  fontSize?: number;
}

export function Barcode({ value, height = 40, fontSize = 12 }: BarcodeProps) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, value, {
      format: "CODE128",
      height,
      fontSize,
      margin: 4,
      displayValue: true,
    });
  }, [value, height, fontSize]);

  return <svg ref={ref} role="img" aria-label={`Barcode for ${value}`} />;
}
