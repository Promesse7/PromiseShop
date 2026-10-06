import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SupplierCardGrid } from "./SupplierCardGrid";
import type { Supplier } from "@/lib/types";

const suppliers: Supplier[] = [
  { supplier_id: 1, name: "Kigali Electronics Ltd", contact_person: "J. Habimana", phone: "+250781234567", email: "sales@kigalielec.rw", address: "KG 11 Ave, Kigali" },
  { supplier_id: 2, name: "Dubai Traders FZE", contact_person: null, phone: null, email: null, address: null },
];

describe("SupplierCardGrid", () => {
  it("renders every supplier card with a fallback for missing contact fields", () => {
    render(<SupplierCardGrid suppliers={suppliers} onEdit={vi.fn()} />);
    expect(screen.getByText("Kigali Electronics Ltd")).toBeInTheDocument();
    expect(screen.getByText("KG 11 Ave, Kigali")).toBeInTheDocument();
    expect(screen.getByText("Dubai Traders FZE")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows the empty state passed in when there are no suppliers", () => {
    render(<SupplierCardGrid suppliers={[]} onEdit={vi.fn()} empty={<p>No suppliers yet</p>} />);
    expect(screen.getByText("No suppliers yet")).toBeInTheDocument();
  });

  it("makes the phone number and email tappable", () => {
    render(<SupplierCardGrid suppliers={suppliers} />);
    expect(screen.getByRole("link", { name: "+250781234567" })).toHaveAttribute("href", "tel:+250781234567");
    expect(screen.getByRole("link", { name: "sales@kigalielec.rw" })).toHaveAttribute("href", "mailto:sales@kigalielec.rw");
  });

  it("labels each Edit button with the supplier for screen readers", () => {
    render(<SupplierCardGrid suppliers={suppliers} onEdit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Edit Kigali Electronics Ltd" })).toBeInTheDocument();
  });

  it("calls onEdit with the supplier when Edit is clicked", async () => {
    const onEdit = vi.fn();
    render(<SupplierCardGrid suppliers={suppliers} onEdit={onEdit} />);
    await userEvent.click(screen.getAllByRole("button", { name: /^Edit/ })[0]);
    expect(onEdit).toHaveBeenCalledWith(suppliers[0]);
  });
});
