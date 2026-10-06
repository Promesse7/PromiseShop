"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { ApprovalDialog } from "@/components/pos/ApprovalDialog";
import { useToast } from "@/components/layout/ToastProvider";
import { ASSET_STATUS_LABELS } from "@/lib/operations/labels";
import {
  useApprovalFlow,
  useChangeAssetStatus,
  useReplaceAsset,
  useShopAssets,
} from "@/lib/operations/useShopUse";
import { useProductSearch } from "@/lib/products/useProductSearch";
import type { ShopAsset, ShopAssetStatus } from "@/lib/types";

type Source = "stock" | "serial" | "spare" | "none";
type Step = 1 | 2 | 3 | 4;

const BROKEN_STATUSES: ShopAssetStatus[] = ["damaged", "under_repair", "retired"];

interface ReplaceAssetWizardProps {
  open: boolean;
  asset: ShopAsset;
  onClose: () => void;
  onDone: (newAssetId: number | null) => void;
}

/**
 * "Our printer broke, we took one from stock": what happened → new status →
 * replace from stock (search or scan a serial), with a spare, or not at all →
 * confirm. The server does it all in one transaction.
 */
export function ReplaceAssetWizard({ open, asset, onClose, onDone }: ReplaceAssetWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [reason, setReason] = useState("");
  const [newStatus, setNewStatus] = useState<ShopAssetStatus>("damaged");
  const [source, setSource] = useState<Source>(asset.product ? "stock" : "spare");
  const [productQuery, setProductQuery] = useState(asset.product_name ?? "");
  const [productId, setProductId] = useState<number | null>(asset.product);
  const [productName, setProductName] = useState<string | null>(asset.product_name);
  const [serial, setSerial] = useState("");
  const [spareId, setSpareId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const flow = useApprovalFlow();
  const replace = useReplaceAsset();
  const changeStatus = useChangeAssetStatus();
  const search = useProductSearch(productQuery, { enabled: open && source === "stock" && step === 3 });
  const spares = useShopAssets({ status: "in_service", is_spare: true }, open && source === "spare");
  const { show } = useToast();

  const spareOptions = spares.assets.filter((a) => a.asset_id !== asset.asset_id);
  const sourceReady =
    source === "none" ||
    (source === "stock" && productId !== null) ||
    (source === "serial" && serial.trim() !== "") ||
    (source === "spare" && spareId !== null);

  function summary(): string {
    if (source === "none") return "No replacement now.";
    if (source === "stock") return `Take one ${productName} from stock.`;
    if (source === "serial") return `Take unit ${serial.trim()} from stock.`;
    return `Bring spare "${spareOptions.find((a) => a.asset_id === spareId)?.name ?? ""}" into service.`;
  }

  function confirm() {
    setError(null);
    if (source === "none") {
      flow.run(
        (approval) => changeStatus.mutateAsync({ assetId: asset.asset_id, to_status: newStatus, reason: reason.trim(), approval }),
        () => {
          show(`${asset.name} marked ${ASSET_STATUS_LABELS[newStatus].toLowerCase()}.`, "success");
          onDone(null);
        },
        setError
      );
      return;
    }
    flow.run(
      (approval) =>
        replace.mutateAsync({
          assetId: asset.asset_id,
          new_status: newStatus,
          reason: reason.trim(),
          replacement_product: source === "stock" ? productId : null,
          replacement_serial: source === "serial" ? serial.trim() : undefined,
          spare_asset: source === "spare" ? spareId : null,
          approval,
        }),
      (created) => {
        show(`${asset.name} replaced.`, "success");
        onDone((created as ShopAsset).asset_id);
      },
      setError
    );
  }

  return (
    <>
      <Dialog
        open={open && !flow.prompt}
        onClose={onClose}
        title={`Report broken / Replace — ${asset.name}`}
        footer={
          <div className="flex justify-end gap-2">
            {step > 1 ? (
              <Button variant="secondary" onClick={() => setStep((s) => (s - 1) as Step)}>Back</Button>
            ) : (
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
            )}
            {step < 4 ? (
              <Button
                disabled={(step === 1 && !reason.trim()) || (step === 3 && !sourceReady)}
                onClick={() => setStep((s) => (s + 1) as Step)}
              >
                Next
              </Button>
            ) : (
              <Button disabled={flow.submitting} onClick={confirm}>{flow.submitting ? "Saving…" : "Confirm"}</Button>
            )}
          </div>
        }
      >
        <div className="flex flex-col gap-3 sm:min-w-[340px]">
          <div className="flex items-center gap-2">
            <p className="m-0 text-xs text-text/50">Step {step} of 4</p>
            <div
              className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-200"
              role="progressbar"
              aria-label="Progress"
              aria-valuemin={1}
              aria-valuemax={4}
              aria-valuenow={step}
            >
              <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${(step / 4) * 100}%` }} />
            </div>
          </div>
          {step === 1 && (
            <Field label="What happened?" name="what_happened" value={reason} onChange={setReason} placeholder="e.g. Fuser burnt out" />
          )}
          {step === 2 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs text-text/70">{asset.name} is now</span>
              <SegmentedToggle
                name="broken-status"
                options={BROKEN_STATUSES.map((s) => ({ value: s, label: ASSET_STATUS_LABELS[s] }))}
                value={newStatus}
                onChange={(v) => setNewStatus(v as ShopAssetStatus)}
              />
            </div>
          )}
          {step === 3 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs text-text/70">Replace it?</span>
              <SegmentedToggle
                name="replace-source"
                options={[
                  { value: "stock", label: "From stock" },
                  { value: "serial", label: "Scan serial" },
                  { value: "spare", label: "Spare asset" },
                  { value: "none", label: "Not now" },
                ]}
                value={source}
                onChange={(v) => setSource(v as Source)}
              />
              {source === "stock" && (
                <>
                  <Field
                    label="Product"
                    name="replacement_product"
                    value={productQuery}
                    onChange={(v) => {
                      setProductQuery(v);
                      setProductId(null);
                    }}
                  />
                  {productId === null && search.results.length > 0 && (
                    <ul className="flex flex-col border border-divider rounded-md">
                      {search.results.map((r) => (
                        <li key={r.product_id}>
                          <button
                            type="button"
                            className="w-full text-left px-2 py-1 text-sm hover:bg-accent/10"
                            onClick={() => {
                              setProductId(r.product_id);
                              setProductName(r.name);
                              setProductQuery(r.name);
                            }}
                          >
                            {r.name} <span className="text-text/50">· {r.in_stock ?? 0} in stock</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {productId !== null && <p className="text-xs text-text/60">Chosen: {productName}</p>}
                </>
              )}
              {source === "serial" && (
                <Field label="Serial" name="replacement_serial" value={serial} onChange={setSerial} placeholder="Scan the unit" />
              )}
              {source === "spare" &&
                (spareOptions.length === 0 ? (
                  <p className="text-sm text-text/50">No spare assets in service.</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {spareOptions.map((a) => (
                      <label key={a.asset_id} className="flex items-center gap-2 text-sm">
                        <input type="radio" name="spare" checked={spareId === a.asset_id} onChange={() => setSpareId(a.asset_id)} />
                        {a.name}
                        {a.serial ? ` (${a.serial})` : ""} · {a.location || "no location"}
                      </label>
                    ))}
                  </div>
                ))}
            </div>
          )}
          {step === 4 && (
            <ul className="text-sm text-text/80 list-disc pl-5">
              <li>Reason: {reason.trim()}</li>
              <li>{asset.name} becomes {ASSET_STATUS_LABELS[newStatus].toLowerCase()}.</li>
              <li>{summary()}</li>
            </ul>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
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
