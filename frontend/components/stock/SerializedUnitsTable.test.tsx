import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SerializedUnitsTable } from "./SerializedUnitsTable";
import type { EquipmentUnit } from "@/lib/types";
import { setMatchMedia } from "@/lib/test/matchMedia";

const units: EquipmentUnit[] = [
  { unit_id: 1, product: 2, serial_number: "JBL6-KX2201", status: "in_stock", assigned_to: null, storage_location: "Shelf B2", condition_notes: null, status_changed_at: "2026-08-18T00:00:00Z" },
  { unit_id: 2, product: 2, serial_number: "JBL6-KX2093", status: "in_use", assigned_to: 7, storage_location: "Repair shelf", condition_notes: "USB-C port loose", status_changed_at: "2026-08-21T00:00:00Z" },
];

describe("SerializedUnitsTable", () => {
  it("renders each unit with its serial linking to the unit's history page", () => {
    render(<SerializedUnitsTable units={units} />);

    expect(screen.getByRole("link", { name: "JBL6-KX2201" })).toHaveAttribute("href", "/stock/units/1");
    expect(screen.getByRole("link", { name: "JBL6-KX2093" })).toHaveAttribute("href", "/stock/units/2");
  });

  it("shows each unit as a tappable card on phone", () => {
    setMatchMedia({ desktop: false });
    render(<SerializedUnitsTable units={units} onToggleSelect={() => {}} onPrintLabel={() => {}} />);
    expect(screen.queryByRole("columnheader")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /JBL6-KX2093/ })).toHaveAttribute("href", "/stock/units/2");
  });

  it("shows who a unit is assigned to and when its status last changed", () => {
    render(<SerializedUnitsTable units={units} employeeNames={new Map([[7, "Eric Mugisha"]])} />);
    expect(screen.getByRole("columnheader", { name: "Assigned to" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Changed" })).toBeInTheDocument();
    expect(screen.getByText("Eric Mugisha")).toBeInTheDocument();
    expect(screen.getByText("18 Aug 2026")).toBeInTheDocument();
    expect(screen.getByText("21 Aug 2026")).toBeInTheDocument();
  });

  it("falls back to the employee id when the name is unknown", () => {
    render(<SerializedUnitsTable units={units} />);
    expect(screen.getByText("Employee #7")).toBeInTheDocument();
  });

  it("shows an empty message when there are no units", () => {
    render(<SerializedUnitsTable units={[]} />);
    expect(screen.getByText("No serialized units for this product")).toBeInTheDocument();
  });

  it("renders a select checkbox and calls onToggleSelect when provided", async () => {
    const onToggleSelect = vi.fn();
    render(<SerializedUnitsTable units={units} selectedIds={new Set()} onToggleSelect={onToggleSelect} />);
    await userEvent.click(screen.getByLabelText("Select JBL6-KX2201"));
    expect(onToggleSelect).toHaveBeenCalledWith(1);
  });

  it("renders a Print label action and calls onPrintLabel with the unit when provided", async () => {
    const onPrintLabel = vi.fn();
    render(<SerializedUnitsTable units={units} onPrintLabel={onPrintLabel} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Print label" })[0]);
    expect(onPrintLabel).toHaveBeenCalledWith(units[0]);
  });
});
