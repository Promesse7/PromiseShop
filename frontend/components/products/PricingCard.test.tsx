import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

  it("offers a Set price action in the no-price state when a handler is given", async () => {
    const onSetPrice = vi.fn();
    render(<PricingCard currentPricing={undefined} onSetPrice={onSetPrice} />);
    expect(screen.getByText("This product can't be sold until it has a selling price.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Set price" }));
    expect(onSetPrice).toHaveBeenCalled();
  });

  it("shows a placeholder margin when there is no wholesale price", () => {
    render(
      <PricingCard
        currentPricing={{ price_id: 1, product: 1, retail_price: "145000.00", effective_date: "2026-07-01", is_current: true }}
      />
    );
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});
