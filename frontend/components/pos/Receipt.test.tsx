import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Receipt } from "./Receipt";
import type { CartLine } from "@/lib/pos/cart";
import type { Sale } from "@/lib/types";

const sale: Sale = {
  sale_id: 841, customer: null, employee: 1, sale_date: "2026-08-23T14:14:00Z",
  payment_method: "cash", total_amount: "590000.00", status: "completed", items: [],
};

const lines: CartLine[] = [
  {
    product: {
      product_id: 1, barcode: "PES-TV-00082", name: "Samsung 43\" TV", brand: "Samsung",
      model_number: "UA43DU7000", category_name: "Televisions", retail_price: 385000, quantity_in_stock: 11,
    },
    quantity: 1,
  },
  {
    product: {
      product_id: 2, barcode: "PES-AUD-00147", name: "JBL Flip 6", brand: "JBL",
      model_number: "JBLFLIP6BLK", category_name: "Audio", retail_price: 145000, quantity_in_stock: 1,
    },
    quantity: 1,
  },
];

describe("Receipt", () => {
  it("renders the sale id, payment method, line items, and total", () => {
    render(<Receipt sale={sale} lines={lines} servedBy="e.mugisha" onPrint={vi.fn()} onNewSale={vi.fn()} />);
    expect(screen.getAllByText("#S-841").length).toBeGreaterThan(0);
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("e.mugisha")).toBeInTheDocument();
    expect(screen.getByText('Samsung 43" TV × 1')).toBeInTheDocument();
    expect(screen.getByText("JBL Flip 6 × 1")).toBeInTheDocument();
    expect(screen.getByText("RWF 590,000")).toBeInTheDocument();
  });

  it("calls onPrint when Print receipt is clicked", async () => {
    const onPrint = vi.fn();
    render(<Receipt sale={sale} lines={lines} servedBy="e.mugisha" onPrint={onPrint} onNewSale={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Print receipt" }));
    expect(onPrint).toHaveBeenCalled();
  });

  it("calls onNewSale when New sale is clicked", async () => {
    const onNewSale = vi.fn();
    render(<Receipt sale={sale} lines={lines} servedBy="e.mugisha" onPrint={vi.fn()} onNewSale={onNewSale} />);
    await userEvent.click(screen.getByRole("button", { name: "New sale" }));
    expect(onNewSale).toHaveBeenCalled();
  });

  it("shows an em dash for payment method when none is set", () => {
    render(
      <Receipt
        sale={{ ...sale, payment_method: null }}
        lines={lines}
        servedBy="e.mugisha"
        onPrint={vi.fn()}
        onNewSale={vi.fn()}
      />
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
