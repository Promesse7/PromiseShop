"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/layout/ToastProvider";
import { apiFetch, ApiError, extractErrorMessage } from "@/lib/api-client";
import type { ProductPricing } from "@/lib/types";

interface SetPriceDialogProps {
  open: boolean;
  productId: number;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SetPriceDialog({ open, productId, isAdmin, onClose, onSaved }: SetPriceDialogProps) {
  const { show } = useToast();
  const queryClient = useQueryClient();
  const [retailPrice, setRetailPrice] = useState("");
  const [wholesalePrice, setWholesalePrice] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setRetailPrice("");
      setWholesalePrice("");
      setEffectiveDate(today());
      setError(null);
    }
  }, [open, productId]);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        product: productId,
        retail_price: retailPrice,
        effective_date: effectiveDate,
      };
      if (isAdmin) {
        payload.wholesale_price = wholesalePrice;
      }
      await apiFetch<ProductPricing>("product-pricing/", { method: "POST", body: JSON.stringify(payload) });
      queryClient.invalidateQueries({ queryKey: ["product-pricing"] });
      show("Price saved.", "success");
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(extractErrorMessage(err.body));
      } else {
        show("Something went wrong — try again.", "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Set new price">
      <div className="flex flex-col gap-3 min-w-[320px]">
        <Field label="Retail price" name="retail_price" type="number" value={retailPrice} onChange={setRetailPrice} />
        {isAdmin && (
          <Field label="Wholesale price" name="wholesale_price" type="number" value={wholesalePrice} onChange={setWholesalePrice} />
        )}
        <Field label="Effective date" name="effective_date" type="date" value={effectiveDate} onChange={setEffectiveDate} />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
