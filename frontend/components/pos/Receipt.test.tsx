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
    { sale_item_id: 1, sale: 841, product: 1, quantity: 1, unit_price: "385000.00", list_price: "385000.00", subtotal: "385000.00", tax_category: "B", tax_amount: "58728.81" },
    { sale_item_id: 2, sale: 841, product: 2, quantity: 1, unit_price: "145000.00", list_price: "145000.00", subtotal: "145000.00", tax_category: "B", tax_amount: "22118.64" },
  ],
};

const mixedCategorySale: Sale = {
  sale_id: 842, customer: null, employee: 1, sale_date: "2026-08-23T14:14:00Z",
  payment_method: "cash", total_amount: "485000.00", status: "completed",
  items: [
    { sale_item_id: 3, sale: 842, product: 1, quantity: 1, unit_price: "385000.00", list_price: "385000.00", subtotal: "385000.00", tax_category: "B", tax_amount: "58728.81" },
    { sale_item_id: 4, sale: 842, product: 3, quantity: 1, unit_price: "100000.00", list_price: "100000.00", subtotal: "100000.00", tax_category: "A", tax_amount: "0.00" },
  ],
};

const discountedSale: Sale = {
  sale_id: 843, customer: null, employee: 1, sale_date: "2026-08-23T14:14:00Z",
  payment_method: "cash", total_amount: "240000.00", status: "completed",
  items: [
    { sale_item_id: 5, sale: 843, product: 2, quantity: 2, unit_price: "120000.00", list_price: "145000.00", subtotal: "240000.00", tax_category: "B", tax_amount: "36610.17" },
  ],
};

const lines: CartLine[] = [
  {
    product: {
      product_id: 1, barcode: "PES-TV-00082", name: "Samsung 43\" TV", brand: "Samsung",
      model_number: "UA43DU7000", category_name: "Televisions", retail_price: 385000, quantity_in_stock: 11,
    },
    quantity: 1,
    unitPrice: 385000,
  },
  {
    product: {
      product_id: 2, barcode: "PES-AUD-00147", name: "JBL Flip 6", brand: "JBL",
      model_number: "JBLFLIP6BLK", category_name: "Audio", retail_price: 145000, quantity_in_stock: 1,
    },
    quantity: 1,
    unitPrice: 145000,
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

  it("says the admin was notified in the app, never by email", () => {
    render(<Receipt sale={sale} lines={lines} servedBy="e.mugisha" onPrint={vi.fn()} onNewSale={vi.fn()} />);
    expect(screen.getByText(/admin notified in the app/)).toBeInTheDocument();
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
  });

  it("prints the unit price of every line", () => {
    render(<Receipt sale={sale} lines={lines} servedBy="e.mugisha" onPrint={vi.fn()} onNewSale={vi.fn()} />);
    expect(screen.getByText("@ 385,000")).toBeInTheDocument();
    expect(screen.getByText("@ 145,000")).toBeInTheDocument();
  });

  it("strikes through the catalog price on a bargained line", () => {
    render(<Receipt sale={discountedSale} lines={lines} servedBy="e.mugisha" onPrint={vi.fn()} onNewSale={vi.fn()} />);
    expect(screen.getByText("JBL Flip 6 × 2")).toBeInTheDocument();
    expect(screen.getByText("@ 120,000")).toBeInTheDocument();
    const struck = screen.getByLabelText("Catalog price");
    expect(struck.tagName).toBe("S");
    expect(struck).toHaveTextContent("145,000");
    expect(screen.getByText("RWF 240,000")).toBeInTheDocument();
  });

  it("does not strike through a line sold at the catalog price", () => {
    render(<Receipt sale={sale} lines={lines} servedBy="e.mugisha" onPrint={vi.fn()} onNewSale={vi.fn()} />);
    expect(screen.queryByLabelText("Catalog price")).not.toBeInTheDocument();
  });

  it("lists each payment with its reference, and the change", () => {
    const paidSale: Sale = {
      ...sale,
      payment_method: null,
      amount_paid: "530000.00",
      balance: "0.00",
      change_due: "20000.00",
      payments: [
        { payment_id: 1, direction: "in", sale: 841, purchase: null, customer: null, supplier: null, amount: "300000.00", method: "cash", reference: "", paid_at: "2026-08-23T14:14:00Z", recorded_by: 1, recorded_by_name: "E", note: "", receipt_group: "g", reversal_of: null, is_reversed: false, created_at: "2026-08-23T14:14:00Z" },
        { payment_id: 2, direction: "in", sale: 841, purchase: null, customer: null, supplier: null, amount: "230000.00", method: "mobile_money", reference: "MP123", paid_at: "2026-08-23T14:14:00Z", recorded_by: 1, recorded_by_name: "E", note: "", receipt_group: "g", reversal_of: null, is_reversed: false, created_at: "2026-08-23T14:14:00Z" },
      ],
    };
    render(<Receipt sale={paidSale} lines={lines} servedBy="e.mugisha" onPrint={vi.fn()} onNewSale={vi.fn()} />);
    expect(screen.getByText("Mobile Money · MP123")).toBeInTheDocument();
    expect(screen.getByText("300,000")).toBeInTheDocument();
    expect(screen.getByText("Change").nextSibling).toHaveTextContent("20,000");
  });

  it("shows what was paid, the balance and the due date on a credit sale", () => {
    const creditSale: Sale = {
      ...sale, customer: 7, customer_name: "Aline Uwase", customer_phone: "0788123456",
      amount_paid: "130000.00", balance: "400000.00", due_date: "2026-09-22", payment_status: "partial",
      payments: [],
    };
    render(<Receipt sale={creditSale} lines={lines} servedBy="e.mugisha" onPrint={vi.fn()} onNewSale={vi.fn()} />);
    expect(screen.getByText("Aline Uwase · 0788123456")).toBeInTheDocument();
    expect(screen.getByText("Balance remaining").nextSibling).toHaveTextContent("RWF 400,000");
    expect(screen.getByText("Due by").nextSibling).toHaveTextContent("22 Sept 2026");
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
    // Total tax is the standard item's tax alone (58,728.81); the exempt item contributes 0.
    expect(screen.getByText("58,728.81")).toBeInTheDocument();
    expect(screen.getByText("RWF 485,000")).toBeInTheDocument();
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
