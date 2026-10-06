"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError, extractErrorMessage, fetchAllPages } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import type { Customer } from "@/lib/types";
import { formatRwf } from "@/lib/format";

interface CustomerPickerProps {
  value: Customer | null;
  onChange: (customer: Customer | null) => void;
}

const inputClass =
  "w-full min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md hover:border-text/45 focus-visible:border-accent focus-visible:outline-none";

/**
 * Find a customer by name or phone, or quick-create one with name + phone.
 * Customers load only once the cashier starts typing, so a walk-in sale costs
 * no extra request.
 */
export function CustomerPicker({ value, onChange }: CustomerPickerProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: () => fetchAllPages<Customer>("customers/"),
    enabled: search.trim().length > 0,
  });

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return (customers.data ?? [])
      .filter((c) => (c.name ?? "").toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [customers.data, search]);

  async function handleCreate() {
    if (!newName.trim() || !newPhone.trim()) {
      setError("Name and phone are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch<Customer>("customers/", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), phone: newPhone.trim() }),
      });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      onChange(created);
      setCreating(false);
      setNewName("");
      setNewPhone("");
      setSearch("");
    } catch (e) {
      setError(e instanceof ApiError ? extractErrorMessage(e.body) : "Couldn't create the customer.");
    } finally {
      setSaving(false);
    }
  }

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 border border-divider rounded-md px-2.5 py-1.5 text-sm">
        <div>
          <div>{value.name ?? "Customer"}</div>
          <div className="text-xs text-text/50">
            {value.phone ?? "no phone"}
            {value.balance && Number(value.balance) > 0 ? ` · owes ${formatRwf(value.balance)}` : ""}
          </div>
        </div>
        <Button variant="ghost" className="text-xs" onClick={() => onChange(null)}>
          Change
        </Button>
      </div>
    );
  }

  if (creating) {
    return (
      <div className="flex flex-col gap-2 border border-divider rounded-md p-2">
        <input aria-label="New customer name" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} className={inputClass} />
        <input aria-label="New customer phone" placeholder="Phone" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className={inputClass} />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving}>{saving ? "Saving…" : "Add customer"}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        aria-label="Customer"
        className={inputClass}
        placeholder="Search name or phone…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {matches.map((c) => (
        <button
          key={c.customer_id}
          type="button"
          onClick={() => onChange(c)}
          className="text-left text-sm px-2.5 py-1.5 rounded-md hover:bg-text/[0.07]"
        >
          {c.name ?? "—"} <span className="text-xs text-text/50">{c.phone ?? ""}</span>
        </button>
      ))}
      {search.trim() && !customers.isLoading && matches.length === 0 && (
        <p className="text-xs text-text/50 px-1">No customer matches.</p>
      )}
      <Button
        variant="ghost"
        className="self-start text-xs"
        onClick={() => {
          setCreating(true);
          setNewName(/\d/.test(search) ? "" : search.trim());
          setNewPhone(/\d/.test(search) ? search.trim() : "");
        }}
      >
        + New customer
      </Button>
    </div>
  );
}
