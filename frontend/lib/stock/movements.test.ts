import { describe, expect, it } from "vitest";
import { formatDelta, movementsQuery, movementsToCsv } from "./movements";
import type { StockMovement } from "@/lib/types";

const row: StockMovement = {
  movement_id: 1, product: 7, product_name: 'TV 43", Samsung', movement_type: "to_damaged",
  bucket: "damaged", quantity_delta: 2, balance_after: 3, unit_cost: "55000.00",
  source_type: "adjustment", source_id: 4, reason: "Dropped", created_by: 1,
  created_by_name: "Manager One", created_at: "2026-10-06T08:00:00Z",
};

describe("movementsQuery", () => {
  it("includes only the filters that are set", () => {
    expect(movementsQuery({ product: 7, type: "", bucket: "damaged", from: "2026-10-01" }, 50)).toBe(
      "product=7&bucket=damaged&from=2026-10-01&page_size=50"
    );
  });
});

describe("formatDelta", () => {
  it("signs positive changes", () => {
    expect(formatDelta(3)).toBe("+3");
    expect(formatDelta(-2)).toBe("-2");
  });
});

describe("movementsToCsv", () => {
  it("quotes cells with commas and quotes, and includes cost when allowed", () => {
    const csv = movementsToCsv([row], true);
    expect(csv.split("\n")[0]).toBe("Date,Product,Type,Bucket,Change,Balance after,Unit cost,By,Reason");
    expect(csv.split("\n")[1]).toBe(
      '2026-10-06T08:00:00Z,"TV 43"", Samsung",To damaged,Damaged,2,3,55000.00,Manager One,Dropped'
    );
  });

  it("leaves the cost column out for staff and names system rows", () => {
    const csv = movementsToCsv([{ ...row, unit_cost: undefined, created_by_name: null }], false);
    expect(csv).not.toContain("Unit cost");
    expect(csv.split("\n")[1].endsWith(",System,Dropped")).toBe(true);
  });
});
