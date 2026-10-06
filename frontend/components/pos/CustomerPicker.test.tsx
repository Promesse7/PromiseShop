import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerPicker } from "./CustomerPicker";
import type { Customer } from "@/lib/types";

const aline: Customer = {
  customer_id: 7, name: "Aline Uwase", phone: "0788123456", email: null, address: null, balance: "50000.00",
};

function renderPicker(value: Customer | null = null) {
  const onChange = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CustomerPicker value={value} onChange={onChange} />
    </QueryClientProvider>
  );
  return onChange;
}

describe("CustomerPicker", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, options?: RequestInit) => {
        if (options?.method === "POST") {
          return Promise.resolve({ ok: true, json: async () => ({ ...aline, customer_id: 9, name: "New Person", balance: "0.00" }) });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ count: 1, next: null, previous: null, results: url.includes("customers") ? [aline] : [] }),
        });
      })
    );
  });

  it("loads nothing until the cashier types", () => {
    renderPicker();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("finds a customer by phone and selects them", async () => {
    const onChange = renderPicker();
    await userEvent.type(screen.getByLabelText("Customer"), "0788");
    await userEvent.click(await screen.findByRole("button", { name: /Aline Uwase/ }));
    expect(onChange).toHaveBeenCalledWith(aline);
  });

  it("shows the selected customer's balance and lets the cashier change it", async () => {
    const onChange = renderPicker(aline);
    expect(screen.getByText(/owes RWF 50,000/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("quick-creates a customer with name and phone", async () => {
    const onChange = renderPicker();
    await userEvent.click(screen.getByRole("button", { name: "+ New customer" }));
    await userEvent.click(screen.getByRole("button", { name: "Add customer" }));
    expect(screen.getByText("Name and phone are required.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("New customer name"), "New Person");
    await userEvent.type(screen.getByLabelText("New customer phone"), "0788999999");
    await userEvent.click(screen.getByRole("button", { name: "Add customer" }));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/customers/",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "New Person", phone: "0788999999" }) })
    );
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ customer_id: 9 }));
  });
});
