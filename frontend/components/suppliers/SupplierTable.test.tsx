import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SupplierTable } from "./SupplierTable";
import type { Supplier } from "@/lib/types";

const suppliers: Supplier[] = [
  { supplier_id: 1, name: "Kigali Electronics Ltd", contact_person: "J. Habimana", phone: "+250781234567", email: "sales@kigalielec.rw", address: "KG 11 Ave, Kigali" },
  { supplier_id: 2, name: "Dubai Traders FZE", contact_person: null, phone: null, email: null, address: null },
];

describe("SupplierTable", () => {
  it("renders every supplier row with a fallback for missing contact fields", () => {
    render(<SupplierTable suppliers={suppliers} onEdit={vi.fn()} />);
    expect(screen.getByText("Kigali Electronics Ltd")).toBeInTheDocument();
    expect(screen.getByText("KG 11 Ave, Kigali")).toBeInTheDocument();
    expect(screen.getByText("Dubai Traders FZE")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows an empty state when there are no suppliers", () => {
    render(<SupplierTable suppliers={[]} onEdit={vi.fn()} />);
    expect(screen.getByText("No suppliers found")).toBeInTheDocument();
  });

  it("calls onEdit with the supplier when Edit is clicked", async () => {
    const onEdit = vi.fn();
    render(<SupplierTable suppliers={suppliers} onEdit={onEdit} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(onEdit).toHaveBeenCalledWith(suppliers[0]);
  });
});
