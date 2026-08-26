"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface QrCodeProps {
  value: string;
  size?: number;
}

export function QrCode({ value, size = 96 }: QrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1 }).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) return null;
  // A generated data: URL, not a static asset — next/image can't optimize this, so a plain
  // img is the correct choice here rather than a lint workaround.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={dataUrl} width={size} height={size} alt={`QR code: ${value}`} />;
}
