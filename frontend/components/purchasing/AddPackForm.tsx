"use client";

import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAllPages, ApiError, extractErrorMessage } from "@/lib/api-client";
import { ProductCombobox } from "@/components/purchasing/ProductCombobox";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Card, CardKicker } from "@/components/ui/Card";
import { useToast } from "@/components/layout/ToastProvider";
import { useAddPurchaseLine } from "@/lib/purchasing/useBundles";
import type { Category, ProductSearchResult } from "@/lib/types";

interface AddPackFormProps {
  purchaseId: number;
  onAdded: () => void;
}

type Choice = { kind: "existing"; product: ProductSearchResult } | { kind: "new"; name: string } | null;

function money(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—";
}

/** A pack line: N packs of M single units, priced per pack (e.g. 3 cartons of 24). */
export function AddPackForm({ purchaseId, onAdded }: AddPackFormProps) {
  const categoryId = useId();
  const { show } = useToast();
  const addLine = useAddPurchaseLine();
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => fetchAllPages<Category>("categories/") });

  const [text, setText] = useState("");
  const [choice, setChoice] = useState<Choice>(null);
  const [category, setCategory] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [packs, setPacks] = useState("1");
  const [unitsPerPack, setUnitsPerPack] = useState("");
  const [paid, setPaid] = useState("");
  const [invoiced, setInvoiced] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const packCount = Number(packs);
  const perPack = Number(unitsPerPack);
  const units = packCount > 0 && perPack > 0 ? packCount * perPack : 0;
  const perUnit = perPack > 0 && paid !== "" ? Number(paid) / perPack : NaN;

  function reset() {
    setText(""); setChoice(null); setCategory(""); setSellingPrice("");
    setPacks("1"); setUnitsPerPack(""); setPaid(""); setInvoiced(""); setNote(""); setError(null);
  }

  function validate(): string | null {
    if (!choice) return "Choose the product in the pack (or create it).";
    if (choice.kind === "new" && (!category || sellingPrice === "")) return "A new product needs a category and a selling price.";
    if (!(packCount >= 1) || !Number.isInteger(packCount)) return "Enter how many packs.";
    if (!(perPack >= 2) || !Number.isInteger(perPack)) return "A pack holds at least 2 units.";
    if (paid === "" || Number(paid) < 0) return "Enter the price paid per pack.";
    const invoicedValue = invoiced === "" ? paid : invoiced;
    if (Number(invoicedValue) !== Number(paid) && !note.trim()) return "Add a note: paid and invoiced differ.";
    return null;
  }

  async function handleSubmit() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    const base = {
      line_kind: "pack" as const,
      quantity: packCount,
      units_per_pack: perPack,
      unit_cost_paid: paid,
      unit_cost_invoiced: invoiced === "" ? paid : invoiced,
      price_discrepancy_note: note.trim(),
    };
    const payload =
      choice!.kind === "existing"
        ? { ...base, product: choice!.product.product_id }
        : { ...base, category: Number(category), name: choice!.name, selling_price: sellingPrice };
    try {
      await addLine.mutateAsync({ purchaseId, payload });
      show(`Pack added — ${units} units.`, "success");
      reset();
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? extractErrorMessage(err.body) : "Something went wrong — try again.");
    }
  }

  return (
    <Card elevation="md">
      <CardKicker>Pack — the supplier sells a carton/box of single units</CardKicker>
      <div className="flex flex-col gap-3">
        {choice ? (
          <div className="flex items-center gap-2 text-sm">
            <span>
              Product: <strong>{choice.kind === "existing" ? choice.product.name : choice.name}</strong>
              {choice.kind === "new" && " (new)"}
            </span>
            <Button variant="ghost" onClick={() => setChoice(null)}>Change</Button>
          </div>
        ) : (
          <ProductCombobox
            aria-label="Product in the pack"
            value={text}
            onChange={setText}
            onPick={(product) => setChoice({ kind: "existing", product })}
            onCreateNew={(name) => setChoice({ kind: "new", name })}
          />
        )}
        {choice?.kind === "new" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={categoryId} className="text-xs text-text/70">Category</label>
              <select
                id={categoryId}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="min-h-9 py-1.5 px-2.5 text-sm bg-surface border border-divider rounded-md"
              >
                <option value="">Choose…</option>
                {(categories.data ?? []).map((c) => (
                  <option key={c.category_id} value={c.category_id}>{c.name}</option>
                ))}
              </select>
            </div>
            <Field label="Selling price per unit" name="selling_price" type="number" value={sellingPrice} onChange={setSellingPrice} />
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Packs" name="packs" type="number" value={packs} onChange={setPacks} />
          <Field label="Units per pack" name="units_per_pack" type="number" value={unitsPerPack} onChange={setUnitsPerPack} />
          <Field label="Paid / pack" name="paid" type="number" value={paid} onChange={setPaid} />
          <Field label="Invoiced / pack" name="invoiced" type="number" value={invoiced} onChange={setInvoiced} placeholder="same as paid" />
        </div>
        <Field label="Discrepancy note" name="note" value={note} onChange={setNote} />
        <p className="text-sm text-text/70" aria-live="polite">
          {units > 0
            ? `${packCount} × pack of ${perPack} = ${units} units in stock · ${money(perUnit)} per unit`
            : "Enter packs and units per pack to see the units received."}
        </p>
        {error && <p className="text-xs text-red-500" role="alert">{error}</p>}
        <div>
          <Button onClick={handleSubmit} disabled={addLine.isPending}>
            {addLine.isPending ? "Adding…" : "Add pack line"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
