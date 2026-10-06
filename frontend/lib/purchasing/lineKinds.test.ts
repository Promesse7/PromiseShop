import { describe, expect, it } from "vitest";
import {
  allocationRemaining,
  describeLine,
  labelsForReceivedItems,
  totalUnits,
  unitsOf,
} from "./lineKinds";
import type { PurchaseItem } from "@/lib/types";

const single: PurchaseItem = {
  purchase_item_id: 1, purchase: 9, product: 5, line_kind: "single", units_per_pack: 1, quantity: 4,
  units_received: 4, price_discrepancy_note: null,
};
const pack: PurchaseItem = {
  purchase_item_id: 2, purchase: 9, product: 6, line_kind: "pack", units_per_pack: 24, quantity: 3,
  units_received: 72, price_discrepancy_note: null,
};
const bundle: PurchaseItem = {
  purchase_item_id: 3, purchase: 9, product: null, line_kind: "bundle", units_per_pack: 1, quantity: 2,
  bundle_name: "Canalbox TV kit", units_received: 42, price_discrepancy_note: null,
  components: [
    { component_id: 10, product: 7, product_name: "TV", product_barcode: "PES-TV-1", qty_per_bundle: 1, units: 2 },
    { component_id: 11, product: 6, product_name: "Decoder", product_barcode: "PES-TV-2", qty_per_bundle: 20, units: 40 },
  ],
};

describe("lineKinds", () => {
  it("counts single units for every kind", () => {
    expect(unitsOf(single)).toBe(4);
    expect(unitsOf(pack)).toBe(72);
    expect(unitsOf(bundle)).toBe(42);
    expect(totalUnits([single, pack, bundle])).toBe(118);
  });

  it("falls back to quantity x units per pack when units_received is missing", () => {
    expect(unitsOf({ ...pack, units_received: undefined })).toBe(72);
  });

  it("describes packs and bundles the way the supplier sold them", () => {
    expect(describeLine(pack, "Decoder")).toBe("Decoder — 3 × pack of 24 = 72 units");
    expect(describeLine(bundle, null)).toBe("Canalbox TV kit — 2 bundles = 42 units");
    expect(describeLine(single, "Speaker")).toBe("Speaker");
  });

  it("builds one label per received unit, per product", () => {
    const catalog = new Map([
      [5, { name: "Speaker", barcode: "PES-AUD-1", retail_price: 100 }],
      [6, { name: "Decoder", barcode: "PES-TV-2", retail_price: 25000 }],
      [7, { name: "TV", barcode: "PES-TV-1", retail_price: 500000 }],
    ]);
    const labels = labelsForReceivedItems([single, pack, bundle], catalog);
    expect(labels).toEqual([
      { product: 5, name: "Speaker", barcode: "PES-AUD-1", retail_price: 100, copies: 4 },
      { product: 6, name: "Decoder", barcode: "PES-TV-2", retail_price: 25000, copies: 112 },
      { product: 7, name: "TV", barcode: "PES-TV-1", retail_price: 500000, copies: 2 },
    ]);
    expect(labels.reduce((n, l) => n + l.copies, 0)).toBe(118);
  });

  it("works out what's left to allocate, to the cent", () => {
    expect(allocationRemaining("800000.00", ["400000.00", "399999.99"])).toBe("0.01");
    expect(allocationRemaining("100", ["60", "40"])).toBe("0.00");
    expect(allocationRemaining("100", ["60", ""])).toBe("40.00");
    expect(allocationRemaining("100", ["70", "40"])).toBe("-10.00");
  });
});
