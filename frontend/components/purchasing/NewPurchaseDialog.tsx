"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { useToast } from "@/components/layout/ToastProvider";
import { useSuppliers } from "@/lib/suppliers/useSuppliers";
import { useCreatePurchase } from "@/lib/purchasing/useCreatePurchase";
import { ApiError, extractErrorMessage } from "@/lib/api-client";
import {
  emptyPurchaseFormValues,
  buildPurchasePayload,
  validatePurchaseForm,
  type PurchaseFormValues,
  type PurchaseFormErrors,
} from "@/lib/purchasing/purchaseForm";

const PAYMENT_STATUS_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partial" },
  { value: "unpaid", label: "Unpaid" },
];

interface NewPurchaseDialogProps {
  open: boolean;
  onClose: () => void;
  reorderProductName?: string;
}

export function NewPurchaseDialog({ open, onClose, reorderProductName }: NewPurchaseDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="New purchase">
      {open && <NewPurchaseFields key={open ? "open" : "closed"} onClose={onClose} reorderProductName={reorderProductName} />}
    </Dialog>
  );
}

function NewPurchaseFields({
  onClose,
  reorderProductName,
}: {
  onClose: () => void;
  reorderProductName?: string;
}) {
  const supplierId = useId();
  const router = useRouter();
  const { show } = useToast();
  const suppliers = useSuppliers();
  const createPurchase = useCreatePurchase();
  const [values, setValues] = useState<PurchaseFormValues>(emptyPurchaseFormValues);
  const [errors, setErrors] = useState<PurchaseFormErrors>({});

  function setField<K extends keyof PurchaseFormValues>(key: K, value: PurchaseFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit() {
    const validationErrors = validatePurchaseForm(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    try {
      const created = await createPurchase.mutateAsync(buildPurchasePayload(values));
      onClose();
      router.push(
        reorderProductName
          ? `/purchases/${created.purchase_id}?prefill=${encodeURIComponent(reorderProductName)}`
          : `/purchases/${created.purchase_id}`
      );
    } catch (error) {
      const message =
        error instanceof ApiError ? extractErrorMessage(error.body) : "Something went wrong — try again.";
      show(message, "error");
    }
  }

  return (
    <div className="flex flex-col gap-3 min-w-[360px]">
      <div className="flex flex-col gap-1">
        <label htmlFor={supplierId} className="block text-xs text-text/70">
          Supplier
        </label>
        <select
          id={supplierId}
          value={values.supplier}
          onChange={(e) => setField("supplier", e.target.value === "" ? "" : Number(e.target.value))}
          className="w-full min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md"
        >
          <option value="">Select a supplier…</option>
          {suppliers.all.map((s) => (
            <option key={s.supplier_id} value={s.supplier_id}>
              {s.name}
            </option>
          ))}
        </select>
        {errors.supplier && <p className="text-xs text-red-400">{errors.supplier}</p>}
      </div>
      <Field
        label="Invoice number"
        name="invoice_number"
        value={values.invoice_number}
        onChange={(v) => setField("invoice_number", v)}
      />
      <Field
        label="Purchase date"
        name="purchase_date"
        type="date"
        value={values.purchase_date}
        onChange={(v) => setField("purchase_date", v)}
        error={errors.purchase_date}
      />
      <div className="flex flex-col gap-1">
        <label className="block text-xs text-text/70">Payment status</label>
        <SegmentedToggle
          name="payment_status"
          options={PAYMENT_STATUS_OPTIONS}
          value={values.payment_status}
          onChange={(v) => setField("payment_status", v as PurchaseFormValues["payment_status"])}
        />
      </div>
      <div className="flex gap-2 justify-end mt-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={createPurchase.isPending}>
          {createPurchase.isPending ? "Creating…" : "Create"}
        </Button>
      </div>
    </div>
  );
}
