import { describe, expect, it } from "vitest";
import { EMPTY_SALES_FILTERS, refundSplit, returnableQuantities, salesQuery } from "./useSalesHistory";
import type { Sale } from "@/lib/types";

function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    sale_id: 1, customer: null, employee: 1, sale_date: "2026-10-06T10:00:00Z", payment_method: "cash",
    total_amount: "300.00", amount_paid: "300.00", returned_amount: "0.00", status: "completed",
    items: [
      { sale_item_id: 11, sale: 1, product: 5, quantity: 3, unit_price: "100.00", list_price: "100.00", subtotal: "300.00", tax_category: "B", tax_amount: "45.76" },
    ],
    returns: [],
    ...overrides,
  };
}

describe("salesQuery", () => {
  it("only sends the filters that are set, then the page", () => {
    expect(salesQuery(EMPTY_SALES_FILTERS)).toBe("page=1&page_size=50");
    expect(salesQuery({ ...EMPTY_SALES_FILTERS, from: "2026-10-01", cashier: "3", has_return: true }, 2)).toBe(
      "from=2026-10-01&cashier=3&has_return=true&page=2&page_size=50"
    );
  });
});

describe("returnableQuantities", () => {
  it("subtracts everything already returned on each line", () => {
    const s = sale({
      returns: [{
        return_id: 1, sale: 1, reason: "x", refund_method: "cash", refund_reference: "", refund_total: "100.00",
        paid_out: "100.00", balance_reduced: "0.00", refund_payment: 9, created_by: 1, created_by_name: "M",
        approved_by: null, created_at: "2026-10-06T11:00:00Z",
        items: [{ return_item_id: 1, sale_item: 11, product_name: "Speaker", quantity: 1, refund_amount: "100.00", condition: "resellable" }],
      }],
    });
    expect(returnableQuantities(s)).toEqual({ 11: 2 });
  });
});

describe("refundSplit", () => {
  it("pays the whole refund out on a fully paid sale", () => {
    expect(refundSplit(sale(), 100)).toEqual({ paidOut: 100, balanceReduced: 0 });
  });

  it("reduces what is owed first on a credit sale, paying out only the excess", () => {
    const credit = sale({ amount_paid: "100.00" }); // 200 still owed
    expect(refundSplit(credit, 100)).toEqual({ paidOut: 0, balanceReduced: 100 });
    expect(refundSplit(credit, 300)).toEqual({ paidOut: 100, balanceReduced: 200 });
  });
});
