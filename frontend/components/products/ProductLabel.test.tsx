import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductLabel } from "./ProductLabel";

describe("ProductLabel", () => {
  it("renders the product name, price, and a barcode", () => {
    render(<ProductLabel product={{ name: "JBL Flip 6", barcode: "PES-AUD-00147", retail_price: 145000 }} />);
    expect(screen.getByText("JBL Flip 6")).toBeInTheDocument();
    expect(screen.getByText("RWF 145,000")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Barcode for PES-AUD-00147" })).toBeInTheDocument();
  });
});
