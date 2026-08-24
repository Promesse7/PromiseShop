import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Table } from "./Table";

describe("Table", () => {
  const columns = [
    { key: "name", header: "Name" },
    { key: "price", header: "Price" },
  ];
  const rows = [
    { name: "Speaker", price: "10000" },
    { name: "Cable", price: "2000" },
  ];

  it("renders column headers", () => {
    render(<Table columns={columns} rows={rows} rowKey={(row) => row.name} />);
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Price" })).toBeInTheDocument();
  });

  it("renders one row per data item", () => {
    render(<Table columns={columns} rows={rows} rowKey={(row) => row.name} />);
    expect(screen.getByText("Speaker")).toBeInTheDocument();
    expect(screen.getByText("Cable")).toBeInTheDocument();
  });

  it("renders an empty state when rows is empty", () => {
    render(<Table columns={columns} rows={[]} rowKey={(row) => row.name} emptyMessage="No products" />);
    expect(screen.getByText("No products")).toBeInTheDocument();
  });
});
