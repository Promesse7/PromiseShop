import { describe, expect, it } from "vitest";
import { consumptionsToCsv, ASSET_STATUS_LABELS, PURPOSE_LABELS, formatValue } from "./labels";
import type { InternalConsumption } from "@/lib/types";

const row: InternalConsumption = {
  consumption_id: 1, product: 3, product_name: "HDMI, 2m", product_barcode: "PES-ACC-00001", quantity: 2,
  unit_cost: "2000.00", total_value: "4000.00", purpose: "repair", reason: "Fixed the \"till\"",
  taken_by: 1, taken_by_name: "Aline", recorded_by: 1, recorded_by_name: "Aline", approved_by: null,
  approved_by_name: null, shop_asset: null, shop_asset_name: null, created_at: "2026-10-06T08:00:00Z",
};

describe("shop-use labels", () => {
  it("labels every purpose and status", () => {
    expect(PURPOSE_LABELS.shop_setup).toBe("Shop setup");
    expect(ASSET_STATUS_LABELS.returned_to_stock).toBe("Returned to stock");
  });

  it("formats values, saying when the cost is unknown", () => {
    expect(formatValue("4000.00")).toBe("RWF 4,000");
    expect(formatValue(null)).toBe("cost unknown");
  });

  it("exports consumptions as CSV with value columns only when allowed", () => {
    const withCost = consumptionsToCsv([row], true).split("\n");
    expect(withCost[0]).toBe("Date,Product,Barcode,Quantity,Purpose,Reason,Taken by,Approved by,Unit cost,Value");
    expect(withCost[1]).toContain('"HDMI, 2m"');
    expect(withCost[1]).toContain('"Fixed the ""till"""');
    expect(withCost[1].endsWith("2000.00,4000.00")).toBe(true);

    const withoutCost = consumptionsToCsv([row], false).split("\n");
    expect(withoutCost[0].endsWith("Approved by")).toBe(true);
  });
});
