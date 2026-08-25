import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PurchaseSummaryCard } from "./PurchaseSummaryCard";
import type { Purchase } from "@/lib/types";

function purchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    purchase_id: 1, supplier: 1, employee: 2, invoice_number: "KE-8841", purchase_date: "2026-08-23",
    total_paid: "3002000", total_invoiced: "3034000", payment_status: "paid", status: "draft", items: [],
    ...overrides,
  };
}

describe("PurchaseSummaryCard", () => {
  it("renders the server's total_paid/total_invoiced verbatim, not a client-side sum", () => {
    // If this component summed client-side (e.g. from an empty items array) it would show 0 —
    // asserting the real server totals appear proves no re-summing happens (Decision 4).
    render(<PurchaseSummaryCard purchase={purchase()} />);
    expect(screen.getByText("RWF 3,002,000")).toBeInTheDocument();
    expect(screen.getByText("RWF 3,034,000")).toBeInTheDocument();
  });

  it("shows the difference with the 'profit uses paid' caption when paid and invoiced differ", () => {
    render(<PurchaseSummaryCard purchase={purchase()} />);
    expect(screen.getByText(/32,000/)).toBeInTheDocument();
    expect(screen.getByText(/profit uses paid/)).toBeInTheDocument();
  });

  it("hides the difference row when paid equals invoiced", () => {
    render(<PurchaseSummaryCard purchase={purchase({ total_paid: "100", total_invoiced: "100" })} />);
    expect(screen.queryByText(/profit uses paid/)).not.toBeInTheDocument();
  });

  it("shows a dash when totals are omitted for a non-admin viewer", () => {
    render(<PurchaseSummaryCard purchase={purchase({ total_paid: undefined, total_invoiced: undefined })} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
