import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PricingCard } from "./PricingCard";
import type { ProductPricing } from "@/lib/types";

const currentPricing: ProductPricing = {
  price_id: 2, product: 1, wholesale_price: "112000.00", retail_price: "145000.00",
  effective_date: "2026-07-01", is_current: true,
};

describe("PricingCard", () => {
  it("renders retail, wholesale, margin, and effective date", () => {
    render(<PricingCard currentPricing={currentPricing} />);
    expect(screen.getByText("RWF 145,000")).toBeInTheDocument();
    expect(screen.getByText("RWF 112,000")).toBeInTheDocument();
    expect(screen.getByText("22.8%")).toBeInTheDocument();
    expect(screen.getByText("01 Jul 2026")).toBeInTheDocument();
  });

  it("shows a no-price-set state when there is no current pricing", () => {
    render(<PricingCard currentPricing={undefined} />);
    expect(screen.getByText("No price set")).toBeInTheDocument();
  });

  it("shows a placeholder margin when there is no wholesale price", () => {
    render(
      <PricingCard
        currentPricing={{ price_id: 1, product: 1, retail_price: "145000.00", effective_date: "2026-07-01", is_current: true }}
      />
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
