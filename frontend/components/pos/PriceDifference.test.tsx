import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PriceDifference } from "./PriceDifference";
import type { CartLine } from "@/lib/pos/cart";
import type { PriceCheckLine } from "@/lib/types";

const product = {
  product_id: 1, barcode: "B", name: "Speaker", brand: null, model_number: null,
  category_name: "Audio", retail_price: 100000, quantity_in_stock: 5,
};

function line(unitPrice: number, quantity = 1): CartLine {
  return { product, quantity, unitPrice };
}

function verdict(overrides: Partial<PriceCheckLine>): PriceCheckLine {
  return { index: 0, product: 1, rule: "discount", discount_pct: "5.00", needs_approval: false, needs_note: false, ...overrides };
}

describe("PriceDifference", () => {
  it("shows nothing at the catalog price", () => {
    const { container } = render(<PriceDifference line={line(100000)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a markup in green with the difference in RWF and %", () => {
    render(<PriceDifference line={line(110000, 2)} />);
    const diff = screen.getByText(/\+RWF 20,000/);
    expect(diff).toHaveTextContent("+10.0%");
    expect(diff.className).toMatch(/green/);
    expect(screen.getByText(/list RWF 100,000/)).toBeInTheDocument();
  });

  it("shows a discount within the limit in amber", () => {
    render(<PriceDifference line={line(95000)} verdict={verdict({ rule: "discount" })} />);
    const diff = screen.getByText(/−RWF 5,000/);
    expect(diff).toHaveTextContent("−5.0%");
    expect(diff.className).toMatch(/amber/);
  });

  it("shows red and says it needs manager approval when the server says so", () => {
    render(<PriceDifference line={line(80000)} verdict={verdict({ rule: "needs_approval", needs_approval: true })} />);
    expect(screen.getByText(/−RWF 20,000/).className).toMatch(/red/);
    expect(screen.getByText("Needs manager approval")).toBeInTheDocument();
  });

  it("asks for a note on a below-floor line", () => {
    render(
      <PriceDifference
        line={line(50000)}
        verdict={verdict({ rule: "below_floor", needs_approval: true, needs_note: true })}
      />
    );
    expect(screen.getByText("Below the minimum price — needs manager approval and a note")).toBeInTheDocument();
  });
});
