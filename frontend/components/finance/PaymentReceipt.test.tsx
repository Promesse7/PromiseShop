import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentReceipt } from "./PaymentReceipt";
import * as useShopProfileModule from "@/lib/settings/useShopProfile";
import type { CustomerPaymentResult } from "@/lib/types";

const payment = (id: number, sale: number, amount: string) => ({
  payment_id: id, direction: "in" as const, sale, purchase: null, customer: 7, supplier: null, amount,
  method: "mobile_money" as const, reference: "MP77", paid_at: "2026-10-06T09:00:00Z", recorded_by: 1,
  recorded_by_name: "Staff", note: "", receipt_group: "abcdef12-3456", reversal_of: null, is_reversed: false,
  created_at: "2026-10-06T09:00:00Z",
});

const result: CustomerPaymentResult = {
  receipt_group: "abcdef12-3456", customer: 7, amount: "150000.00", balance_after: "50000.00",
  payments: [payment(1, 10, "100000.00"), payment(2, 11, "50000.00")],
};

describe("PaymentReceipt", () => {
  beforeEach(() => {
    vi.spyOn(useShopProfileModule, "useShopProfile").mockReturnValue({
      data: { business_name: "Promise Electronic Shop", tin: "123", po_box: null, phone: null, email: null, address: null },
      isLoading: false, isError: false,
    } as ReturnType<typeof useShopProfileModule.useShopProfile>);
  });

  it("lists the sales the payment cleared and the balance left", () => {
    render(<PaymentReceipt result={result} customerName="Aline" onClose={vi.fn()} />);
    expect(screen.getByText("Payment receipt")).toBeInTheDocument();
    expect(screen.getByText("ABCDEF12")).toBeInTheDocument();
    expect(screen.getByText("Sale #S-10")).toBeInTheDocument();
    expect(screen.getByText("Sale #S-11")).toBeInTheDocument();
    expect(screen.getByText("MoMo · MP77")).toBeInTheDocument();
    expect(screen.getByText("Balance still owed").nextSibling).toHaveTextContent("RWF 50,000");
  });
});
