"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { findByBarcode, searchCatalog } from "@/lib/pos/search";
import type { PosCatalog } from "@/lib/pos/usePosCatalog";
import type { PosProduct } from "@/lib/types";

interface ScanSearchFieldProps {
  catalog: PosCatalog;
  onAdd: (product: PosProduct) => void;
}

const MAX_SUGGESTIONS = 8;

export function ScanSearchField({ catalog, onAdd }: ScanSearchFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matches = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    return searchCatalog(catalog, trimmed).slice(0, MAX_SUGGESTIONS);
  }, [catalog, query]);

  function addAndReset(product: PosProduct) {
    onAdd(product);
    setQuery("");
    setNotFound(false);
    inputRef.current?.focus();
  }

  function resolve() {
    const trimmed = query.trim();
    if (!trimmed) return;

    const match = findByBarcode(catalog, trimmed) ?? matches[0];
    if (match) {
      addAndReset(match);
    } else {
      setNotFound(true);
    }
  }

  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-xs text-text/70 mb-1">
        Scan barcode or search product
      </label>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id={id}
          className="w-full max-w-[420px] min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md hover:border-text/45 focus-visible:border-accent focus-visible:outline-none"
          placeholder="Ready to scan…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setNotFound(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              resolve();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={resolve}>
          Search
        </Button>
      </div>
      {matches.length > 1 && (
        <div className="flex flex-col gap-1 mt-1 max-w-[420px]">
          {matches.map((p) => (
            <button
              key={p.product_id}
              type="button"
              onClick={() => addAndReset(p)}
              className="text-left text-sm py-1.5 px-2 hover:bg-text/[0.07] rounded-md"
            >
              {p.name} <span className="text-xs font-mono text-text/50">{p.barcode}</span>
            </button>
          ))}
        </div>
      )}
      {notFound && <p className="text-xs text-text/60 mt-1">Not in catalog — add product?</p>}
    </div>
  );
}
