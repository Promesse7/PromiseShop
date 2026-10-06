"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { ApprovalDialog } from "@/components/pos/ApprovalDialog";
import { useToast } from "@/components/layout/ToastProvider";
import { ASSET_STATUS_LABELS } from "@/lib/operations/labels";
import { useApprovalFlow, useChangeAssetStatus, useReturnAssetToStock } from "@/lib/operations/useShopUse";
import type { ShopAsset, ShopAssetStatus } from "@/lib/types";

interface AssetActionDialogProps {
  open: boolean;
  asset: ShopAsset;
  /** "status": change status among `statuses`; "return": admin puts it back into stock. */
  mode: "status" | "return";
  statuses?: ShopAssetStatus[];
  onClose: () => void;
}

export function AssetActionDialog({ open, asset, mode, statuses = [], onClose }: AssetActionDialogProps) {
  const options = statuses.filter((s) => s !== asset.status);
  const [status, setStatus] = useState<ShopAssetStatus>(options[0] ?? "in_service");
  const [bucket, setBucket] = useState<"in_stock" | "damaged">("in_stock");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const flow = useApprovalFlow();
  const changeStatus = useChangeAssetStatus();
  const returnToStock = useReturnAssetToStock();
  const { show } = useToast();

  function save() {
    setError(null);
    flow.run(
      (approval) =>
        mode === "status"
          ? changeStatus.mutateAsync({ assetId: asset.asset_id, to_status: status, reason: reason.trim(), approval })
          : returnToStock.mutateAsync({ assetId: asset.asset_id, bucket, reason: reason.trim() }),
      () => {
        show(mode === "status" ? "Status changed." : `${asset.name} is back in stock.`, "success");
        onClose();
      },
      setError
    );
  }

  return (
    <>
      <Dialog
        open={open && !flow.prompt}
        onClose={onClose}
        title={mode === "status" ? `Change status — ${asset.name}` : `Return to stock — ${asset.name}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button disabled={!reason.trim() || flow.submitting} onClick={save}>
              {flow.submitting ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3 sm:min-w-[320px]">
          {mode === "status" ? (
            <SegmentedToggle
              name="asset-status"
              options={options.map((s) => ({ value: s, label: ASSET_STATUS_LABELS[s] }))}
              value={status}
              onChange={(v) => setStatus(v as ShopAssetStatus)}
            />
          ) : (
            <>
              <p className="text-xs text-text/60">It stops being a shop asset and goes back into stock.</p>
              <SegmentedToggle
                name="return-bucket"
                options={[
                  { value: "in_stock", label: "Sellable stock" },
                  { value: "damaged", label: "Damaged stock" },
                ]}
                value={bucket}
                onChange={(v) => setBucket(v as "in_stock" | "damaged")}
              />
            </>
          )}
          <Field label="Reason" name="reason" value={reason} onChange={setReason} />
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
