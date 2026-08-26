import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QrCode } from "./QrCode";

describe("QrCode", () => {
  it("renders a QR code image once generated", async () => {
    render(<QrCode value="SAMPLE RECEIPT #841 — NOT FISCALLY VALID" />);
    const img = await screen.findByRole("img", { name: "QR code: SAMPLE RECEIPT #841 — NOT FISCALLY VALID" });
    expect(img).toHaveAttribute("src", expect.stringContaining("data:image"));
  });
});
