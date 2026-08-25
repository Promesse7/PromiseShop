"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { findByBarcode, searchCatalog } from "@/lib/pos/search";
import type { PosCatalog } from "@/lib/pos/usePosCatalog";
import type { PosProduct } from "@/lib/types";

interface ScanSearchFieldProps {
  catalog: PosCatalog;
  onAdd: (product: PosProduct) => void;
}

export function ScanSearchField({ catalog, onAdd }: ScanSearchFieldProps) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [notFound, setNotFound] = useState(false);

  function resolve() {
    const trimmed = query.trim();
    if (!trimmed) return;

    const match = findByBarcode(catalog, trimmed) ?? searchCatalog(catalog, trimmed)[0];
    if (match) {
      onAdd(match);
      setQuery("");
      setNotFound(false);
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
      {notFound && <p className="text-xs text-text/60 mt-1">Not in catalog — add product?</p>}
    </div>
  );
}
