import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CustomerCardGrid } from "./CustomerCardGrid";
import type { Customer } from "@/lib/types";

const customers: Customer[] = [
  { customer_id: 1, name: "Grace Mukamana", phone: "+250781234567", email: "grace.m@gmail.com", address: null },
  { customer_id: 2, name: null, phone: null, email: null, address: null },
];

describe("CustomerCardGrid", () => {
  it("renders every customer card with a fallback for a missing name", () => {
    render(<CustomerCardGrid customers={customers} onEdit={vi.fn()} />);
    expect(screen.getByText("Grace Mukamana")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows an empty state when there are no customers", () => {
    render(<CustomerCardGrid customers={[]} onEdit={vi.fn()} />);
    expect(screen.getByText("No customers found")).toBeInTheDocument();
  });

  it("calls onEdit with the customer when Edit is clicked", async () => {
    const onEdit = vi.fn();
    render(<CustomerCardGrid customers={customers} onEdit={onEdit} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(onEdit).toHaveBeenCalledWith(customers[0]);
  });
});
