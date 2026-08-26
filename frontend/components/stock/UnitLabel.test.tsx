import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UnitLabel } from "./UnitLabel";

describe("UnitLabel", () => {
  it("renders the product name and a barcode for the serial number", () => {
    render(<UnitLabel productName="JBL Flip 6 Speaker" serialNumber="JBL6-KX2201" />);
    expect(screen.getByText("JBL Flip 6 Speaker")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Barcode for JBL6-KX2201" })).toBeInTheDocument();
  });
});
