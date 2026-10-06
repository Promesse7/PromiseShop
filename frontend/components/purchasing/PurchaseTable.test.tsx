import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { act } from "react";
import { setMatchMedia } from "@/lib/test/matchMedia";
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
  it("shows the empty state passed in when there are no purchases", () => {
    render(<PurchaseTable rows={[]} showTotals={false} empty={<p>No purchases yet</p>} />);
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
    expect(screen.getByText("RWF 3,002,000")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows the Total invoiced column beside Total paid when showTotals is true", () => {
    render(<PurchaseTable rows={rows} showTotals={true} />);
    expect(screen.getByRole("columnheader", { name: "Total invoiced" })).toBeInTheDocument();
    expect(screen.getByText("RWF 3,034,000")).toBeInTheDocument();
  });

  it("hides the Total invoiced column when showTotals is false", () => {
    render(<PurchaseTable rows={rows} showTotals={false} />);
    expect(screen.queryByRole("columnheader", { name: "Total invoiced" })).not.toBeInTheDocument();
  });

  it("links each row to its purchase workspace", () => {
    render(<PurchaseTable rows={rows} showTotals={false} />);
    expect(screen.getByRole("link", { name: "Kigali Electronics Ltd" })).toHaveAttribute("href", "/purchases/1");
    expect(screen.getByRole("link", { name: "Dubai Traders FZE" })).toHaveAttribute("href", "/purchases/2");
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

  it("sorts by date when the Date header is clicked", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    render(<PurchaseTable rows={rows} showTotals={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Date" }));
    const links = screen.getAllByRole("link").map((l) => l.textContent);
    expect(links).toEqual(["Dubai Traders FZE", "Kigali Electronics Ltd"]);
  });

  it("shows each purchase as a tappable card on phone", () => {
    act(() => setMatchMedia({ desktop: false }));
    render(<PurchaseTable rows={rows} showTotals={false} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const card = screen.getByRole("link", { name: /Kigali Electronics Ltd/ });
    expect(card).toHaveAttribute("href", "/purchases/1");
    expect(card).toHaveTextContent("Draft");
  });
});
