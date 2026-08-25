import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PriceHistoryCard } from "./PriceHistoryCard";
import type { ProductPricing } from "@/lib/types";

const history: ProductPricing[] = [
  { price_id: 2, product: 1, wholesale_price: "112000.00", retail_price: "145000.00", effective_date: "2026-07-01", is_current: true },
  { price_id: 1, product: 1, wholesale_price: "118000.00", retail_price: "155000.00", effective_date: "2026-02-15", is_current: false },
];

describe("PriceHistoryCard", () => {
  it("renders every row with the current one tagged", () => {
    render(<PriceHistoryCard history={history} onSetNewPrice={vi.fn()} />);
    expect(screen.getByText("01 Jul 2026")).toBeInTheDocument();
    expect(screen.getByText("15 Feb 2026")).toBeInTheDocument();
    expect(screen.getByText("current")).toBeInTheDocument();
  });

  it("calls onSetNewPrice when the button is clicked", async () => {
    const onSetNewPrice = vi.fn();
    render(<PriceHistoryCard history={history} onSetNewPrice={onSetNewPrice} />);
    await userEvent.click(screen.getByRole("button", { name: "Set new price" }));
    expect(onSetNewPrice).toHaveBeenCalled();
  });

  it("shows an empty state with no history", () => {
    render(<PriceHistoryCard history={[]} onSetNewPrice={vi.fn()} />);
    expect(screen.getByText("No price history yet")).toBeInTheDocument();
  });
});
