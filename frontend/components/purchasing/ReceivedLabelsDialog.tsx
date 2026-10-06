"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAllPages, ApiError, extractErrorMessage } from "@/lib/api-client";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { LabelSheet } from "@/components/ui/LabelSheet";
import { ProductLabel } from "@/components/products/ProductLabel";
import { useCatalogProducts } from "@/lib/products/useCatalogProducts";
import { useRegisterUnit } from "@/lib/stock/useRegisterUnit";
import { labelsForReceivedItems, totalUnits, type LabelInfo } from "@/lib/purchasing/lineKinds";
import type { EquipmentUnit, PurchaseItem } from "@/lib/types";

interface ReceivedLabelsDialogProps {
  open: boolean;
  onClose: () => void;
  /** The lines that were just received. */
  items: PurchaseItem[];
}

function SerialEntry({ productId, name, expected }: { productId: number; name: string; expected: number }) {
  const register = useRegisterUnit();
  const [serial, setSerial] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const value = serial.trim();
    if (!value) return;
    setError(null);
    try {
      await register.mutateAsync({ product: productId, serial_number: value, storage_location: null, condition_notes: null });
      setSaved((current) => [...current, value]);
      setSerial("");
    } catch (err) {
      setError(err instanceof ApiError ? extractErrorMessage(err.body) : "Couldn't save that serial.");
    }
  }

  return (
    <div className="flex flex-col gap-1 border-t border-divider pt-2">
      <span className="text-sm font-medium">
        {name} <span className="text-text/50">· {saved.length} of {expected} serials</span>
      </span>
      <div className="flex gap-2">
        <input
          aria-label={`Serial for ${name}`}
          placeholder="Scan or type a serial, Enter to save"
          value={serial}
          onChange={(e) => setSerial(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
          }}
          className="flex-1 min-h-9 py-1.5 px-2.5 text-sm bg-surface border border-divider rounded-md"
        />
        <Button variant="secondary" onClick={() => void save()} disabled={register.isPending}>Save</Button>
      </div>
      {saved.length > 0 && <span className="text-xs font-mono text-text/60">{saved.join(", ")}</span>}
      {error && <span className="text-xs text-red-500" role="alert">{error}</span>}
    </div>
  );
}

/**
 * After Receive: print one label per received single unit (packs and bundles
 * broken down), and optionally record serial numbers for serialised products —
 * those that already have EquipmentUnits. Both steps can be skipped.
 */
export function ReceivedLabelsDialog({ open, onClose, items }: ReceivedLabelsDialogProps) {
  const catalog = useCatalogProducts();
  const units = useQuery({
    queryKey: ["equipment-units"],
    queryFn: () => fetchAllPages<EquipmentUnit>("equipment-units/"),
    enabled: open,
  });
  const [scanning, setScanning] = useState(false);

  const labels = useMemo(() => {
    const info = new Map<number, LabelInfo>(
      catalog.all.map((p) => [p.product_id, { name: p.name, barcode: p.barcode, retail_price: p.retail_price }])
    );
    return labelsForReceivedItems(items, info);
  }, [catalog.all, items]);

  const serialised = useMemo(() => {
    const tracked = new Set((units.data ?? []).map((u) => u.product));
    return labels.filter((l) => tracked.has(l.product));
  }, [units.data, labels]);

  const count = totalUnits(items);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Stock received"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Done</Button>
          {serialised.length > 0 && !scanning && (
            <Button variant="secondary" onClick={() => setScanning(true)}>Scan serials now</Button>
          )}
          <Button onClick={() => window.print()} disabled={labels.length === 0}>
            Print labels — {count} label{count === 1 ? "" : "s"} for the units just received
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 max-w-lg">
        <p className="text-sm text-text/70">
          {count} unit{count === 1 ? "" : "s"} went into stock across {labels.length} product{labels.length === 1 ? "" : "s"}.
        </p>
        <ul className="text-sm list-disc pl-5">
          {labels.map((l) => (
            <li key={l.product}>{l.name} × {l.copies}</li>
          ))}
        </ul>
        {scanning && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-text/50">Optional — you can also register serials later from the Stock page.</p>
            {serialised.map((l) => (
              <SerialEntry key={l.product} productId={l.product} name={l.name} expected={l.copies} />
            ))}
          </div>
        )}
      </div>
      <LabelSheet>
        {labels.flatMap((l) =>
          Array.from({ length: l.copies }, (_, i) => (
            <ProductLabel key={`${l.product}-${i}`} product={{ name: l.name, barcode: l.barcode, retail_price: l.retail_price }} />
          ))
        )}
      </LabelSheet>
    </Dialog>
  );
}
