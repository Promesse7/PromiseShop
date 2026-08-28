import { describe, expect, it } from "vitest";
import { buildReorderUrl } from "./reorderUrl";

describe("buildReorderUrl", () => {
  it("builds a purchases URL that opens the dialog prefilled for the given product", () => {
    expect(buildReorderUrl(1, "JBL Flip 6 Speaker")).toBe(
      "/purchases?open=new&reorder_product=1&reorder_name=JBL%20Flip%206%20Speaker"
    );
  });

  it("URL-encodes special characters in the name", () => {
    expect(buildReorderUrl(7, "Scales 60kg")).toBe(
      "/purchases?open=new&reorder_product=7&reorder_name=Scales%2060kg"
    );
  });
});
