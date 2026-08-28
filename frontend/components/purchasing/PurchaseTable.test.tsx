import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PurchaseTable } from "./PurchaseTable";
import type { PurchaseListRow } from "@/lib/purchasing/usePurchases";

const rows: PurchaseListRow[] = [
  {
    purchase_id: 1, supplier_name: "Kigali Electronics Ltd", invoice_number: "KE-8841",
    purchase_date: "2026-08-23", payment_status: "paid", status: "draft",
    total_paid: "3002000", total_invoiced: "3034000",
  },
  {
    purchase_id: 2, supplier_name: "Dubai Traders FZE", invoice_number: null,
    purchase_date: "2026-08-10", payment_status: "unpaid", status: "received",
    total_paid: undefined, total_invoiced: undefined,
  },
];

describe("PurchaseTable", () => {
  it("shows an empty-state message with no purchases", () => {
    render(<PurchaseTable rows={[]} showTotals={false} />);
    expect(screen.getByText("No purchases yet")).toBeInTheDocument();
  });

  it("renders supplier, invoice number (dash when missing), date, payment status, and status tag", () => {
    render(<PurchaseTable rows={rows} showTotals={false} />);
    expect(screen.getByText("Kigali Electronics Ltd")).toBeInTheDocument();
    expect(screen.getByText("KE-8841")).toBeInTheDocument();
    expect(screen.getByText("2026-08-23")).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Received")).toBeInTheDocument();
  });

  it("hides the Total paid column when showTotals is false", () => {
    render(<PurchaseTable rows={rows} showTotals={false} />);
    expect(screen.queryByRole("columnheader", { name: "Total paid" })).not.toBeInTheDocument();
  });

  it("shows the Total paid column, formatted, with a dash when the API omitted it, when showTotals is true", () => {
    render(<PurchaseTable rows={rows} showTotals={true} />);
    expect(screen.getByRole("columnheader", { name: "Total paid" })).toBeInTheDocument();
    expect(screen.getByText("3,002,000")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("links each row to its purchase workspace", () => {
    render(<PurchaseTable rows={rows} showTotals={false} />);
    expect(screen.getAllByRole("link", { name: "Open" })[0]).toHaveAttribute("href", "/purchases/1");
  });

  it("renders a Cancelled status tag for a cancelled purchase", () => {
    render(
      <PurchaseTable
        rows={[{ ...rows[0], status: "cancelled" }]}
        showTotals={false}
      />
    );
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });
});
