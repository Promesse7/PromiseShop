"use client";

import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react";
import { useProductSearch } from "@/lib/products/useProductSearch";
import { autoMatch, didYouMean } from "@/lib/purchasing/bulkRows";
import type { ProductSearchResult } from "@/lib/types";

interface ProductComboboxProps {
  value: string;
  onChange: (text: string) => void;
  /** An existing catalog product was chosen (clicked, Enter, or an exact barcode/name hit). */
  onPick: (product: ProductSearchResult) => void;
  /** The user explicitly chose to create a new product named `name`. */
  onCreateNew: (name: string) => void;
  "aria-label"?: string;
  inputProps?: InputHTMLAttributes<HTMLInputElement> & Record<`data-${string}`, string>;
}

/**
 * Product picker backed by GET /products/search/.
 *
 * Auto-selects only on an exact barcode or exact normalised-name hit; otherwise
 * it lists matches with "+ Create new 'X'" always last. Creating new while a
 * close match (score >= 0.6) exists asks "Did you mean…?" first.
 */
export function ProductCombobox({
  value,
  onChange,
  onPick,
  onCreateNew,
  "aria-label": ariaLabel = "Product",
  inputProps,
}: ProductComboboxProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [confirm, setConfirm] = useState<ProductSearchResult | null>(null);
  const autoPickedFor = useRef<string | null>(null);
  const { results, query } = useProductSearch(value, { enabled: open });
  const trimmed = value.trim();
  const fresh = query === trimmed;
  const options: Array<{ kind: "product"; product: ProductSearchResult } | { kind: "create" }> = trimmed
    ? [...(fresh ? results : []).map((product) => ({ kind: "product" as const, product })), { kind: "create" as const }]
    : [];

  // An exact barcode/name hit for exactly what's in the box picks itself.
  useEffect(() => {
    if (!open || !fresh || !trimmed) return;
    const hit = autoMatch(results);
    if (hit && autoPickedFor.current !== trimmed) {
      autoPickedFor.current = trimmed;
      setOpen(false);
      onPick(hit);
    }
  }, [open, fresh, trimmed, results, onPick]);

  function requestCreate() {
    const close = fresh ? didYouMean(results) : null;
    if (close) {
      setConfirm(close);
      return;
    }
    setOpen(false);
    onCreateNew(trimmed);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    if (option.kind === "product") {
      setOpen(false);
      onPick(option.product);
    } else {
      requestCreate();
    }
  }

  return (
    <div className="relative">
      <input
        {...inputProps}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        value={value}
        placeholder="Type a name or scan a barcode…"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          onChange(e.target.value);
          setConfirm(null);
          setHighlight(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) => Math.min(h + 1, Math.max(options.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (trimmed) choose(Math.min(highlight, options.length - 1));
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="min-h-8 py-1 px-2 text-sm text-text bg-surface border border-divider rounded-md w-full"
      />
      {confirm && (
        <div role="alertdialog" aria-label="Did you mean" className="mt-1 p-2 rounded-md border border-divider bg-surface text-sm flex flex-col gap-1">
          <span className="text-text/70">Did you mean…?</span>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setConfirm(null);
              setOpen(false);
              onPick(confirm);
            }}
            className="text-left py-1 px-2 rounded-md bg-text/[0.07]"
          >
            {confirm.name} <span className="text-xs font-mono text-text/50">{confirm.barcode}</span>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setConfirm(null);
              setOpen(false);
              onCreateNew(trimmed);
            }}
            className="text-left py-1 px-2 rounded-md hover:bg-text/[0.07]"
          >
            {`No, create new "${trimmed}"`}
          </button>
        </div>
      )}
      {open && !confirm && options.length > 0 && (
        <ul id={listId} role="listbox" className="mt-1 flex flex-col gap-0.5 rounded-md border border-divider bg-surface p-1">
          {options.map((option, index) => (
            <li
              key={option.kind === "product" ? option.product.product_id : "create"}
              role="option"
              aria-selected={index === highlight}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(index)}
              className={`cursor-pointer text-sm py-1 px-2 rounded-md ${index === highlight ? "bg-text/[0.07]" : ""}`}
            >
              {option.kind === "product" ? (
                <>
                  {option.product.name}{" "}
                  <span className="text-xs font-mono text-text/50">{option.product.barcode}</span>
                  {option.product.in_stock != null && (
                    <span className="text-xs text-text/50"> · {option.product.in_stock} in stock</span>
                  )}
                </>
              ) : (
                <span className="text-accent">{`+ Create new "${trimmed}"`}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
