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
import { LoadingState } from "@/components/ui/LoadingState";
import { Page } from "@/components/ui/Page";
import type { ShopProfile } from "@/lib/types";

// Dashboard alert thresholds (Module H5): field, label, default (the handoff's values).
const ALERT_FIELDS = [
  ["alert_discount_spike_ratio", "Discount spike: this week's average above × the 8-week average", "2.00"],
  ["alert_overdue_days", "Customer debt overdue more than (days)", "60"],
  ["alert_cash_variance", "Day closed with a cash variance beyond ± (RWF)", "5000.00"],
  ["alert_below_cost_count", "Product sold below cost more than (times)", "3"],
  ["alert_below_cost_days", "… within (days)", "7"],
  ["alert_asset_replacements", "Shop asset replaced more than (times)", "2"],
  ["alert_asset_window_days", "… within (days)", "90"],
  ["alert_billing_diff_pct", "Supplier billing differences above (% of purchases this month)", "2.00"],
  ["alert_top_sellers", "Low stock alert on the top (sellers)", "20"],
] as const;

type AlertField = (typeof ALERT_FIELDS)[number][0];

type ProfileForm = Record<
  "business_name" | "tin" | "po_box" | "phone" | "email" | "address" | "max_staff_discount_pct" | AlertField,
  string
>;

function toForm(profile: ShopProfile): ProfileForm {
  const alerts = Object.fromEntries(
    ALERT_FIELDS.map(([key, , fallback]) => [key, profile[key] != null ? String(profile[key]) : fallback])
  ) as Record<AlertField, string>;
  return {
    business_name: profile.business_name,
    tin: profile.tin ?? "",
    po_box: profile.po_box ?? "",
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    address: profile.address ?? "",
    max_staff_discount_pct: profile.max_staff_discount_pct ?? "10.00",
    ...alerts,
  };
}

export default function SettingsPageClient({ isAdmin }: { isAdmin: boolean }) {
  const profile = useShopProfile();

  if (!isAdmin) {
    return (
      <Page title="Settings">
        <p className="text-sm text-text/70">This screen is limited to Admin accounts.</p>
      </Page>
    );
  }
  return (
    <Page title="Settings" description="Shop details for receipts, the bargaining limit, and dashboard alerts.">
      {profile.isError ? (
        <ErrorState message="Couldn't load the shop settings." onRetry={profile.refetch} />
      ) : profile.isLoading || !profile.data ? (
        <LoadingState variant="form" label="Loading settings…" />
      ) : (
        <SettingsForm initial={toForm(profile.data)} />
      )}
    </Page>
  );
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
    const badAlert = ALERT_FIELDS.find(([key]) => values[key] === "" || Number.isNaN(Number(values[key])) || Number(values[key]) < 0);
    if (badAlert) {
      setError(`"${badAlert[1]}" must be a number of 0 or more.`);
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
          ...Object.fromEntries(ALERT_FIELDS.map(([key]) => [key, values[key]])),
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["shop-profile"] });
      queryClient.invalidateQueries({ queryKey: ["price-check"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-money", "alerts"] });
      show("Settings saved.", "success");
    } catch (e) {
      setError(e instanceof ApiError ? extractErrorMessage(e.body) : "Couldn't save the settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void handleSave();
      }}
      className="flex max-w-[640px] flex-col gap-4"
    >
      <Section title="Shop details" hint="Printed on every receipt.">
        <Field label="Business name" name="business_name" value={values.business_name} onChange={set("business_name")} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="TIN" name="tin" value={values.tin} onChange={set("tin")} />
          <Field label="P.O. Box" name="po_box" value={values.po_box} onChange={set("po_box")} />
          <Field label="Phone" name="phone" value={values.phone} onChange={set("phone")} />
          <Field label="Email" name="email" type="email" value={values.email} onChange={set("email")} />
        </div>
        <Field label="Address" name="address" value={values.address} onChange={set("address")} />
      </Section>
      <Section
        title="Bargaining at the till"
        hint="Beyond this, or below a product's minimum price, a manager or admin must approve with their PIN. Markups have no limit."
      >
        <Field
          label="Most a cashier may discount alone (%)"
          name="max_staff_discount_pct"
          type="number"
          value={values.max_staff_discount_pct}
          onChange={set("max_staff_discount_pct")}
        />
      </Section>
      <Section title="Dashboard alerts" hint="When these lines are crossed, the dashboard shows an alert.">
        {ALERT_FIELDS.map(([key, label]) => (
          <Field key={key} label={label} name={key} type="number" value={values[key]} onChange={set(key)} />
        ))}
      </Section>
      <div
        role="region"
        aria-label="Save changes"
        className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 -mx-1 flex items-center gap-3 rounded-lg border border-divider bg-surface/95 px-3 py-2.5 shadow-md backdrop-blur lg:bottom-4"
      >
        {error ? <p className="m-0 flex-1 text-xs text-red-500">{error}</p> : <span className="flex-1 text-xs text-text/50">Changes apply as soon as you save.</span>}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const id = `settings-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id}>
      <Card elevation="sm" className="flex flex-col gap-3">
        <div>
          <CardKicker>
            <span id={id}>{title}</span>
          </CardKicker>
          {hint && <p className="m-0 mt-1 text-xs text-text/50">{hint}</p>}
        </div>
        {children}
      </Card>
    </section>
  );
}
