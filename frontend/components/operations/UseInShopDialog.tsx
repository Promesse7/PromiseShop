"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { ApprovalDialog } from "@/components/pos/ApprovalDialog";
import { useToast } from "@/components/layout/ToastProvider";
import { PURPOSE_LABELS } from "@/lib/operations/labels";
import { useApprovalFlow, useConsumeStock, useShopAssets, useTakeAsAsset } from "@/lib/operations/useShopUse";
import type { ConsumptionPurpose, ShopAsset } from "@/lib/types";

const SELECT_CLASS = "w-full min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md";

interface UseInShopDialogProps {
  open: boolean;
  product: { product_id: number; name: string };
  inStock: number;
  onClose: () => void;
}

type Mode = "consume" | "asset";

/**
 * Product page → "Use in shop": either consume units (cable, toner, a part fitted
 * to the shop's own equipment) or turn one unit into a shop asset. Neither is an
 * expense. Staff need a manager PIN; the server says so and the PIN dialog opens.
 */
export function UseInShopDialog({ open, product, inStock, onClose }: UseInShopDialogProps) {
  const [mode, setMode] = useState<Mode>("consume");
  const [quantity, setQuantity] = useState("1");
  const [purpose, setPurpose] = useState<ConsumptionPurpose>("repair");
  const [reason, setReason] = useState("");
  const [assetId, setAssetId] = useState("");
  const [serial, setSerial] = useState("");
  const [name, setName] = useState(product.name);
  const [location, setLocation] = useState("");
  const [isSpare, setIsSpare] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const purposeId = useId();
  const assetSelectId = useId();
  const spareId = useId();
  const consume = useConsumeStock();
  const takeAsset = useTakeAsAsset();
  const flow = useApprovalFlow();
  const inService = useShopAssets({ status: "in_service" }, open && mode === "consume");
  const { show } = useToast();
  const router = useRouter();

  const qty = Number(quantity);
  const qtyError =
    mode === "consume" && (!Number.isInteger(qty) || qty < 1)
      ? "Use at least 1."
      : mode === "consume" && qty > inStock
        ? `Only ${inStock} in stock.`
        : undefined;
  const canSubmit = reason.trim() !== "" && !qtyError && inStock > 0 && !flow.submitting;

  function close() {
    setError(null);
    flow.cancel();
    onClose();
  }

  function submit() {
    setError(null);
    if (mode === "consume") {
      flow.run(
        (approval) =>
          consume.mutateAsync({
            product: product.product_id, quantity: qty, purpose, reason: reason.trim(),
            shop_asset: assetId ? Number(assetId) : null, approval,
          }),
        () => {
          show(`${qty} × ${product.name} recorded as used in the shop.`, "success");
          close();
        },
        setError
      );
    } else {
      flow.run(
        (approval) =>
          takeAsset.mutateAsync({
            product: product.product_id, serial: serial.trim() || undefined, name: name.trim() || undefined,
            location: location.trim(), is_spare: isSpare, reason: reason.trim(), approval,
          }),
        (asset) => {
          show(`${(asset as ShopAsset).name} is now a shop asset.`, "success");
          close();
          router.push(`/shop-use/assets/${(asset as ShopAsset).asset_id}`);
        },
        setError
      );
    }
  }

  return (
    <>
      <Dialog open={open && !flow.prompt} onClose={close} title={`Use in shop — ${product.name}`}>
        <div className="flex flex-col gap-3 sm:min-w-[320px]">
          <SegmentedToggle
            name="use-in-shop-mode"
            options={[
              { value: "consume", label: "Consume" },
              { value: "asset", label: "Make shop asset" },
            ]}
            value={mode}
            onChange={(v) => setMode(v as Mode)}
          />
          <p className="text-xs text-text/60">
            {mode === "consume"
              ? "Used up or fitted to the shop's own equipment — it won't come back. Not an expense."
              : "One unit leaves sellable stock and becomes equipment the shop runs on."}{" "}
            {inStock} in stock.
          </p>
          {mode === "consume" ? (
            <>
              <Field label="Quantity" name="quantity" type="number" value={quantity} onChange={setQuantity} error={qtyError} />
              <div className="flex flex-col gap-1">
                <label htmlFor={purposeId} className="block text-xs text-text/70">Purpose</label>
                <select id={purposeId} value={purpose} onChange={(e) => setPurpose(e.target.value as ConsumptionPurpose)} className={SELECT_CLASS}>
                  {(Object.keys(PURPOSE_LABELS) as ConsumptionPurpose[]).map((p) => (
                    <option key={p} value={p}>{PURPOSE_LABELS[p]}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={assetSelectId} className="block text-xs text-text/70">Used to fix (optional)</label>
                <select id={assetSelectId} value={assetId} onChange={(e) => setAssetId(e.target.value)} className={SELECT_CLASS}>
                  <option value="">No particular asset</option>
                  {inService.assets.map((a) => (
                    <option key={a.asset_id} value={a.asset_id}>{a.name}{a.serial ? ` (${a.serial})` : ""}</option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              <Field label="Serial (optional — scan the unit)" name="serial" value={serial} onChange={setSerial} />
              <Field label="Asset name" name="asset_name" value={name} onChange={setName} />
              <Field label="Location" name="location" value={location} onChange={setLocation} placeholder="e.g. Counter" />
              <label htmlFor={spareId} className="flex items-center gap-2 text-sm text-text/80">
                <input id={spareId} type="checkbox" checked={isSpare} onChange={(e) => setIsSpare(e.target.checked)} />
                Keep as a spare
              </label>
            </>
          )}
          <Field label="Reason" name="reason" value={reason} onChange={setReason} placeholder="What it was used for" />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t border-divider bg-surface px-1 pt-3">
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button disabled={!canSubmit} onClick={submit}>
              {flow.submitting ? "Saving…" : mode === "consume" ? "Record use" : "Make shop asset"}
            </Button>
          </div>
        </div>
      </Dialog>
      <ApprovalDialog
        open={flow.prompt !== null}
        reason={flow.prompt?.reason ?? ""}
        error={flow.prompt?.error}
        submitting={flow.submitting}
        onApprove={(approval) => flow.approve(approval)}
        onClose={() => flow.cancel()}
      />
    </>
  );
}
