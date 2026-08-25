"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/layout/ToastProvider";
import { apiFetch, ApiError, extractErrorMessage } from "@/lib/api-client";
import {
  emptyCustomerFormValues,
  customerFormValuesFromCustomer,
  buildCustomerPayload,
  validateCustomerForm,
  type CustomerFormValues,
  type CustomerFormErrors,
} from "@/lib/customers/customerForm";
import type { Customer } from "@/lib/types";

interface CustomerFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  initialCustomer?: Customer;
  onClose: () => void;
  onSaved: () => void;
}

export function CustomerFormDialog({ open, onClose, ...rest }: CustomerFormDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={rest.mode === "create" ? "New customer" : "Edit customer"}>
      {open && (
        <CustomerFormFields
          key={`${rest.mode}-${rest.initialCustomer?.customer_id ?? "new"}`}
          onClose={onClose}
          {...rest}
        />
      )}
    </Dialog>
  );
}

function CustomerFormFields({
  mode,
  initialCustomer,
  onClose,
  onSaved,
}: Omit<CustomerFormDialogProps, "open">) {
  const { show } = useToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<CustomerFormValues>(() =>
    mode === "edit" && initialCustomer ? customerFormValuesFromCustomer(initialCustomer) : emptyCustomerFormValues()
  );
  const [errors, setErrors] = useState<CustomerFormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function setField<K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit() {
    const validationErrors = validateCustomerForm(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const payload = buildCustomerPayload(values);
      if (mode === "create") {
        await apiFetch<Customer>("customers/", { method: "POST", body: JSON.stringify(payload) });
      } else if (initialCustomer) {
        await apiFetch<Customer>(`customers/${initialCustomer.customer_id}/`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      show(mode === "create" ? "Customer created." : "Customer saved.", "success");
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
