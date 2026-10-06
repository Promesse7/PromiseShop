import { describe, expect, it } from "vitest";
import { formatRwf } from "./format";

describe("formatRwf", () => {
  it("formats whole francs with thousands separators", () => {
    expect(formatRwf("530000.00")).toBe("RWF 530,000");
    expect(formatRwf(1234500)).toBe("RWF 1,234,500");
    expect(formatRwf(0)).toBe("RWF 0");
  });

  it("rounds to whole francs", () => {
    expect(formatRwf("999.50")).toBe("RWF 1,000");
    expect(formatRwf(12.4)).toBe("RWF 12");
  });

  it("shows a dash for missing values", () => {
    expect(formatRwf(null)).toBe("—");
    expect(formatRwf(undefined)).toBe("—");
    expect(formatRwf("")).toBe("—");
    expect(formatRwf("not a number")).toBe("—");
  });

  it("puts a minus sign before RWF for negatives", () => {
    expect(formatRwf(-500)).toBe("−RWF 500");
    expect(formatRwf("-228000.00")).toBe("−RWF 228,000");
  });

  it("adds a plus sign for positives when asked", () => {
    expect(formatRwf(500, { sign: true })).toBe("+RWF 500");
    expect(formatRwf(-500, { sign: true })).toBe("−RWF 500");
    expect(formatRwf(0, { sign: true })).toBe("RWF 0");
  });
});
