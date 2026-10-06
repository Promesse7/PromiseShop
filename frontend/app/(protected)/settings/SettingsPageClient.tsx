"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError, extractErrorMessage } from "@/lib/api-client";
import { useShopProfile } from "@/lib/settings/useShopProfile";
import { useToast } from "@/components/layout/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardKicker } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import type { ShopProfile } from "@/lib/types";

type ProfileForm = Record<
  "business_name" | "tin" | "po_box" | "phone" | "email" | "address" | "max_staff_discount_pct",
  string
>;

function toForm(profile: ShopProfile): ProfileForm {
  return {
    business_name: profile.business_name,
    tin: profile.tin ?? "",
    po_box: profile.po_box ?? "",
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    address: profile.address ?? "",
    max_staff_discount_pct: profile.max_staff_discount_pct ?? "10.00",
  };
}

export default function SettingsPageClient({ isAdmin }: { isAdmin: boolean }) {
  const profile = useShopProfile();

  if (!isAdmin) {
    return (
      <div className="text-sm text-text/70">
        <h4 className="m-0 mb-2">Settings</h4>
        <p>This screen is limited to Admin accounts.</p>
      </div>
    );
  }
  if (profile.isError) return <ErrorState message="Couldn't load the shop settings." />;
  if (profile.isLoading || !profile.data) return <p className="text-sm text-text/50">Loading…</p>;
  return <SettingsForm initial={toForm(profile.data)} />;
}

function SettingsForm({ initial }: { initial: ProfileForm }) {
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (key: keyof ProfileForm) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  async function handleSave() {
    const pct = Number(values.max_staff_discount_pct);
    if (!values.business_name.trim()) {
      setError("The business name is required.");
      return;
    }
    if (values.max_staff_discount_pct === "" || Number.isNaN(pct) || pct < 0 || pct > 100) {
      setError("The staff discount limit must be between 0 and 100%.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await apiFetch("shop-profile/", {
        method: "PATCH",
        body: JSON.stringify({
          business_name: values.business_name.trim(),
          tin: values.tin.trim() || null,
          po_box: values.po_box.trim() || null,
          phone: values.phone.trim() || null,
          email: values.email.trim() || null,
          address: values.address.trim() || null,
          max_staff_discount_pct: pct.toFixed(2),
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["shop-profile"] });
      queryClient.invalidateQueries({ queryKey: ["price-check"] });
      show("Settings saved.", "success");
    } catch (e) {
      setError(e instanceof ApiError ? extractErrorMessage(e.body) : "Couldn't save the settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-[560px]">
      <PageHeader title="Settings" />
      <Card elevation="sm">
        <CardKicker>Shop details (printed on receipts)</CardKicker>
        <Field label="Business name" name="business_name" value={values.business_name} onChange={set("business_name")} />
        <Field label="TIN" name="tin" value={values.tin} onChange={set("tin")} />
        <Field label="P.O. Box" name="po_box" value={values.po_box} onChange={set("po_box")} />
        <Field label="Phone" name="phone" value={values.phone} onChange={set("phone")} />
        <Field label="Email" name="email" type="email" value={values.email} onChange={set("email")} />
        <Field label="Address" name="address" value={values.address} onChange={set("address")} />
      </Card>
      <Card elevation="sm">
        <CardKicker>Bargaining at the till</CardKicker>
        <Field
          label="Most a cashier may discount alone (%)"
          name="max_staff_discount_pct"
          type="number"
          value={values.max_staff_discount_pct}
          onChange={set("max_staff_discount_pct")}
        />
        <p className="text-xs text-text/50">
          Beyond this, or below a product&apos;s minimum price, a manager or admin must approve with their PIN.
          Markups have no limit.
        </p>
      </Card>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div>
        <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>
      </div>
    </div>
  );
}
