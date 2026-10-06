"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/layout/ToastProvider";
import { ApiError, extractErrorMessage } from "@/lib/api-client";
import { useDuplicatePairs, useMergePreview, useMergeProducts } from "@/lib/products/useProductMerge";
import type { DuplicatePair, MergeCounts, MergeProductSummary } from "@/lib/types";

const COUNT_LABELS: Array<[keyof MergeCounts, string]> = [
  ["sale_items", "sale lines"],
  ["purchase_items", "purchase lines"],
  ["equipment_units", "serial units"],
  ["price_rows", "price history rows"],
  ["barcode_aliases", "barcodes that will scan as the kept product"],
  ["in_stock", "in stock"],
  ["in_use", "in use"],
  ["damaged", "damaged"],
];

function ProductLine({ product }: { product: MergeProductSummary }) {
  return (
    <span>
      {product.name} <span className="font-mono text-xs text-text/50">{product.barcode}</span>
      <span className="text-xs text-text/50"> · {product.category_name} · {product.in_stock ?? 0} in stock</span>
    </span>
  );
}

interface MergeStepProps {
  pair: DuplicatePair;
  onBack: () => void;
  onMerged: () => void;
}

function MergeStep({ pair, onBack, onMerged }: MergeStepProps) {
  const { show } = useToast();
  const [keepId, setKeepId] = useState(pair.a.product_id);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const duplicate = keepId === pair.a.product_id ? pair.b : pair.a;
  const keep = keepId === pair.a.product_id ? pair.a : pair.b;
  const preview = useMergePreview(keep.product_id, duplicate.product_id);
  const merge = useMergeProducts();

  async function handleMerge() {
    if (!reason.trim()) {
      setError("Say why these are the same product.");
      return;
    }
    setError(null);
    try {
      await merge.mutateAsync({ keepId: keep.product_id, duplicateId: duplicate.product_id, reason: reason.trim() });
      show(`Merged into ${keep.name}.`, "success");
      onMerged();
    } catch (err) {
      setError(err instanceof ApiError ? extractErrorMessage(err.body) : "Something went wrong — try again.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs text-text/70 mb-1">Which product do you keep?</legend>
        {[pair.a, pair.b].map((product) => (
          <label key={product.product_id} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="keep"
              checked={keepId === product.product_id}
              onChange={() => setKeepId(product.product_id)}
              aria-label={`Keep ${product.name}`}
            />
            <ProductLine product={product} />
          </label>
        ))}
      </fieldset>

      <div className="text-sm">
        <p className="text-text/70 mb-1">
          Moving from <strong>{duplicate.name}</strong> to <strong>{keep.name}</strong>:
        </p>
        {preview.isLoading && <p className="text-text/50">Counting…</p>}
        {preview.isError && <p className="text-red-400">{extractErrorMessage((preview.error as ApiError)?.body)}</p>}
        {preview.data && (
          <ul className="list-disc pl-5">
            {COUNT_LABELS.map(([key, label]) => (
              <li key={key}>
                {preview.data.counts[key]} {label}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="merge-reason" className="text-xs text-text/70">Reason</label>
        <input
          id="merge-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Same speaker entered twice"
          className="min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md"
        />
      </div>

      <p role="alert" className="text-sm text-amber-700 bg-amber-50 border border-amber-300 rounded-md p-2">
        This can&apos;t be undone. {duplicate.name} will be deactivated and renamed; its old barcode will scan as {keep.name}.
      </p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <Button onClick={handleMerge} disabled={merge.isPending || !preview.data}>
          {merge.isPending ? "Merging…" : `Merge into ${keep.name}`}
        </Button>
      </div>
    </div>
  );
}

interface DuplicatesDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Admin: products that look alike (trigram similarity >= 0.6), and merging them. */
export function DuplicatesDialog({ open, onClose }: DuplicatesDialogProps) {
  const { pairs, isLoading, isError } = useDuplicatePairs(open);
  const [selected, setSelected] = useState<DuplicatePair | null>(null);
  const [wasOpen, setWasOpen] = useState(false);

  if (open && !wasOpen) {
    setWasOpen(true);
    setSelected(null);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  return (
    <Dialog open={open} onClose={onClose} title={selected ? "Merge duplicate products" : "Possible duplicates"}>
      <div className="min-w-[420px] max-w-[640px]">
        {selected ? (
          <MergeStep pair={selected} onBack={() => setSelected(null)} onMerged={() => setSelected(null)} />
        ) : (
          <div className="flex flex-col gap-2">
            {isLoading && <p className="text-sm text-text/50">Looking for duplicates…</p>}
            {isError && <p className="text-sm text-red-400">Couldn&apos;t load duplicates.</p>}
            {!isLoading && !isError && pairs.length === 0 && (
              <p className="text-sm text-text/50">No likely duplicates found.</p>
            )}
            {pairs.map((pair) => (
              <div key={`${pair.a.product_id}-${pair.b.product_id}`} className="flex items-start gap-3 border-b border-divider py-2 text-sm">
                <div className="flex flex-col gap-0.5 flex-1">
                  <ProductLine product={pair.a} />
                  <ProductLine product={pair.b} />
                  <span className="text-xs text-text/50">{Math.round(pair.score * 100)}% alike</span>
                </div>
                <Button variant="secondary" onClick={() => setSelected(pair)}>
                  Merge…
                </Button>
              </div>
            ))}
            <div className="flex justify-end">
              <Button variant="secondary" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
