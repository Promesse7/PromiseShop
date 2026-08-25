"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/layout/ToastProvider";
import { apiFetch, ApiError, extractErrorMessage } from "@/lib/api-client";
import {
  emptySupplierFormValues,
  supplierFormValuesFromSupplier,
  buildSupplierPayload,
  validateSupplierForm,
  type SupplierFormValues,
  type SupplierFormErrors,
} from "@/lib/suppliers/supplierForm";
import type { Supplier } from "@/lib/types";

interface SupplierFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  initialSupplier?: Supplier;
  onClose: () => void;
  onSaved: () => void;
}

export function SupplierFormDialog({ open, onClose, ...rest }: SupplierFormDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={rest.mode === "create" ? "New supplier" : "Edit supplier"}>
      {open && (
        <SupplierFormFields
          key={`${rest.mode}-${rest.initialSupplier?.supplier_id ?? "new"}`}
          onClose={onClose}
          {...rest}
        />
      )}
    </Dialog>
  );
}

function SupplierFormFields({
  mode,
  initialSupplier,
  onClose,
  onSaved,
}: Omit<SupplierFormDialogProps, "open">) {
  const { show } = useToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<SupplierFormValues>(() =>
    mode === "edit" && initialSupplier ? supplierFormValuesFromSupplier(initialSupplier) : emptySupplierFormValues()
  );
  const [errors, setErrors] = useState<SupplierFormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function setField<K extends keyof SupplierFormValues>(key: K, value: SupplierFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit() {
    const validationErrors = validateSupplierForm(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const payload = buildSupplierPayload(values);
      if (mode === "create") {
        await apiFetch<Supplier>("suppliers/", { method: "POST", body: JSON.stringify(payload) });
      } else if (initialSupplier) {
        await apiFetch<Supplier>(`suppliers/${initialSupplier.supplier_id}/`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      show(mode === "create" ? "Supplier created." : "Supplier saved.", "success");
      onSaved();
    } catch (error) {
      const message =
        error instanceof ApiError ? extractErrorMessage(error.body) : "Something went wrong — try again.";
      show(message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 min-w-[360px]">
      <Field label="Name" name="name" value={values.name} onChange={(v) => setField("name", v)} error={errors.name} />
      <Field label="Contact person" name="contact_person" value={values.contact_person} onChange={(v) => setField("contact_person", v)} />
      <Field label="Phone" name="phone" value={values.phone} onChange={(v) => setField("phone", v)} />
      <Field label="Email" name="email" type="email" value={values.email} onChange={(v) => setField("email", v)} />
      <Field label="Address" name="address" value={values.address} onChange={(v) => setField("address", v)} />
      <div className="flex gap-2 justify-end mt-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
