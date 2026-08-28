import { describe, expect, it } from "vitest";
import { normalizeName } from "./normalizeName";

describe("normalizeName", () => {
  it("lowercases and trims", () => {
    expect(normalizeName("  Scales 60kg  ")).toBe("scales 60kg");
  });

  it("collapses repeated internal whitespace", () => {
    expect(normalizeName("Scales   60kg")).toBe("scales 60kg");
  });

  it("makes a trailing double space and a single space compare equal", () => {
    expect(normalizeName("Scales 60kg ")).toBe(normalizeName("Scales 60kg"));
  });
});
