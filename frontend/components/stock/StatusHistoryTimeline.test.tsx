import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusHistoryTimeline } from "./StatusHistoryTimeline";
import type { EquipmentStatusHistoryEntry } from "@/lib/types";

const entries: EquipmentStatusHistoryEntry[] = [
  { history_id: 2, previous_status: "in_stock", new_status: "damaged", changed_by: 3, change_date: "2026-08-21T16:40:00Z", notes: "Customer return — USB-C port loose" },
  { history_id: 1, previous_status: "", new_status: "in_stock", changed_by: 1, change_date: "2026-07-28T09:05:00Z", notes: "Received on purchase #P-0109" },
];

describe("StatusHistoryTimeline", () => {
  it("renders entries in the order given (newest first, as the API returns them)", () => {
    render(<StatusHistoryTimeline entries={entries} />);
    const items = screen.getAllByTestId("history-entry");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("in stock");
    expect(items[0]).toHaveTextContent("damaged");
    expect(items[1]).toHaveTextContent("in stock");
  });

  it("shows the employee id (not a resolved name) and the notes", () => {
    render(<StatusHistoryTimeline entries={entries} />);
    expect(screen.getByText(/Employee #3/)).toBeInTheDocument();
    expect(screen.getByText("Customer return — USB-C port loose")).toBeInTheDocument();
  });

  it("renders an empty message with no entries", () => {
    render(<StatusHistoryTimeline entries={[]} />);
    expect(screen.getByText("No history yet")).toBeInTheDocument();
  });
});
