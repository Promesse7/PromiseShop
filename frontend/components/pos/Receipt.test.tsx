import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Receipt } from "./Receipt";
import * as useShopProfileModule from "@/lib/settings/useShopProfile";
import type { CartLine } from "@/lib/pos/cart";
import type { Sale } from "@/lib/types";

const sale: Sale = {
  sale_id: 841, customer: null, employee: 1, sale_date: "2026-08-23T14:14:00Z",
  payment_method: "cash", total_amount: "530000.00", status: "completed",
  items: [
    { sale_item_id: 1, sale: 841, product: 1, quantity: 1, unit_price: "385000.00", subtotal: "385000.00", tax_category: "B", tax_amount: "58728.81" },
    { sale_item_id: 2, sale: 841, product: 2, quantity: 1, unit_price: "145000.00", subtotal: "145000.00", tax_category: "B", tax_amount: "22118.64" },
  ],
};

const mixedCategorySale: Sale = {
  sale_id: 842, customer: null, employee: 1, sale_date: "2026-08-23T14:14:00Z",
  payment_method: "cash", total_amount: "485000.00", status: "completed",
  items: [
    { sale_item_id: 3, sale: 842, product: 1, quantity: 1, unit_price: "385000.00", subtotal: "385000.00", tax_category: "B", tax_amount: "58728.81" },
    { sale_item_id: 4, sale: 842, product: 3, quantity: 1, unit_price: "100000.00", subtotal: "100000.00", tax_category: "A", tax_amount: "0.00" },
  ],
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
  beforeEach(() => {
    vi.spyOn(useShopProfileModule, "useShopProfile").mockReturnValue({
      data: {
        business_name: "Promise Electronic Shop", tin: "123456789", po_box: "PO Box 1",
        phone: "+250700000000", email: "shop@example.com", address: "Kigali, Rwanda",
      },
      isLoading: false,
      isError: false,
    });
  });

  it("renders the sale id, payment method, line items, and total", () => {
    render(<Receipt sale={sale} lines={lines} servedBy="e.mugisha" onPrint={vi.fn()} onNewSale={vi.fn()} />);
    expect(screen.getAllByText("#S-841").length).toBeGreaterThan(0);
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("e.mugisha")).toBeInTheDocument();
    expect(screen.getByText('Samsung 43" TV × 1')).toBeInTheDocument();
    expect(screen.getByText("JBL Flip 6 × 1")).toBeInTheDocument();
    expect(screen.getByText("RWF 530,000")).toBeInTheDocument();
  });

  it("renders the business info from the shop profile", () => {
    render(<Receipt sale={sale} lines={lines} servedBy="e.mugisha" onPrint={vi.fn()} onNewSale={vi.fn()} />);
    expect(screen.getByText("Promise Electronic Shop")).toBeInTheDocument();
    expect(screen.getByText("TIN 123456789")).toBeInTheDocument();
  });

  it("renders a tax summary grouped by category", () => {
    render(<Receipt sale={sale} lines={lines} servedBy="e.mugisha" onPrint={vi.fn()} onNewSale={vi.fn()} />);
    expect(screen.getByText("TOTAL B — Standard (18%)")).toBeInTheDocument();
    expect(screen.getByText("TOTAL TAX")).toBeInTheDocument();
  });

  it("groups tax totals separately for a sale mixing exempt and standard items", () => {
    render(<Receipt sale={mixedCategorySale} lines={lines} servedBy="e.mugisha" onPrint={vi.fn()} onNewSale={vi.fn()} />);
    expect(screen.getByText("TOTAL A — Exempt (0%)")).toBeInTheDocument();
    expect(screen.getByText("TOTAL B — Standard (18%)")).toBeInTheDocument();
    // 385,000 subtotal for category B, 100,000 subtotal for category A — each appears once
    // in the line-item list and once in the tax summary.
    expect(screen.getAllByText("385,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("100,000").length).toBeGreaterThan(0);
  });

  it("shows the sample-receipt disclaimer, never a real legal-receipt claim", () => {
    render(<Receipt sale={sale} lines={lines} servedBy="e.mugisha" onPrint={vi.fn()} onNewSale={vi.fn()} />);
    expect(screen.getByText("SAMPLE RECEIPT — pending EBM/SDC certification")).toBeInTheDocument();
    expect(screen.queryByText(/END OF LEGAL RECEIPT/)).not.toBeInTheDocument();
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
