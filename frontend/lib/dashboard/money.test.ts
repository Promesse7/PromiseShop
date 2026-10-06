import { describe, expect, it } from "vitest";
import { presetRange, rwf, toCsv } from "./money";

describe("presetRange", () => {
  const today = new Date(2026, 9, 6); // 6 Oct 2026

  it("covers today, the last 7 days, this month and last month", () => {
    expect(presetRange("today", today)).toEqual({ from: "2026-10-06", to: "2026-10-06" });
    expect(presetRange("week", today)).toEqual({ from: "2026-09-30", to: "2026-10-06" });
    expect(presetRange("month", today)).toEqual({ from: "2026-10-01", to: "2026-10-06" });
    expect(presetRange("last_month", today)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("handles last month across a year boundary", () => {
    expect(presetRange("last_month", new Date(2026, 0, 15))).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
});

describe("rwf and toCsv", () => {
  it("formats whole francs and a dash for missing values", () => {
    expect(rwf("36220.34")).toBe(`RWF ${(36220).toLocaleString()}`);
    expect(rwf(null)).toBe("—");
  });

  it("quotes cells that need it", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"']])).toBe('a,b\n"x,y","say ""hi"""');
  });
});
