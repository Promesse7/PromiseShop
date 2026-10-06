import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DataTable, type DataColumn } from "./DataTable";
import { EmptyState } from "./EmptyState";
import { setMatchMedia } from "@/lib/test/matchMedia";

interface Sale {
  id: number;
  receipt: string;
  cashier: string;
  total: string;
  status: string;
  date: string;
}

const rows: Sale[] = [
  { id: 1, receipt: "S-1", cashier: "Aline", total: "1000.00", status: "completed", date: "2026-10-01" },
  { id: 2, receipt: "S-2", cashier: "Bosco", total: "250000.00", status: "voided", date: "2026-10-03" },
  { id: 3, receipt: "S-3", cashier: "Claire", total: "75000.00", status: "completed", date: "2026-10-02" },
];

const columns: DataColumn<Sale>[] = [
  { key: "receipt", header: "Receipt", primary: true },
  { key: "cashier", header: "Cashier", sortValue: (r) => r.cashier },
  { key: "total", header: "Total", money: true, sortValue: (r) => Number(r.total) },
  { key: "status", header: "Status" },
  { key: "date", header: "Date", mobile: false },
];

function bodyRows() {
  return within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row");
}

describe("DataTable (desktop)", () => {
  it("renders headers and rows, money right-aligned in whole RWF", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => String(r.id)} />);
    expect(screen.getByRole("columnheader", { name: /Receipt/ })).toBeInTheDocument();
    const cell = screen.getByRole("cell", { name: "RWF 250,000" });
    expect(cell).toHaveClass("text-right");
  });

  it("sorts by a sortable column, ascending then descending", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => String(r.id)} />);
    const totalHeader = screen.getByRole("columnheader", { name: /Total/ });
    await userEvent.click(within(totalHeader).getByRole("button"));
    expect(totalHeader).toHaveAttribute("aria-sort", "ascending");
    expect(bodyRows()[0]).toHaveTextContent("S-1");
    await userEvent.click(within(totalHeader).getByRole("button"));
    expect(totalHeader).toHaveAttribute("aria-sort", "descending");
    expect(bodyRows()[0]).toHaveTextContent("S-2");
  });

  it("applies a default sort", () => {
    render(
      <DataTable columns={columns} rows={rows} rowKey={(r) => String(r.id)} defaultSort={{ key: "cashier", dir: "desc" }} />
    );
    expect(bodyRows()[0]).toHaveTextContent("Claire");
  });

  it("does not make plain columns sortable", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => String(r.id)} />);
    const statusHeader = screen.getByRole("columnheader", { name: "Status" });
    expect(within(statusHeader).queryByRole("button")).not.toBeInTheDocument();
  });

  it("links the primary cell when rowHref is given", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => String(r.id)} rowHref={(r) => `/sales/${r.id}`} />);
    expect(screen.getByRole("link", { name: "S-2" })).toHaveAttribute("href", "/sales/2");
  });

  it("calls onRowClick when a row is clicked", async () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => String(r.id)} onRowClick={onRowClick} />);
    await userEvent.click(screen.getByText("Bosco"));
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });

  it("shows the empty state when there are no rows", () => {
    render(
      <DataTable columns={columns} rows={[]} rowKey={(r) => String(r.id)} empty={<EmptyState title="No sales yet" />} />
    );
    expect(screen.getByText("No sales yet")).toBeInTheDocument();
  });

  it("shows a loading skeleton while loading", () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(r) => String(r.id)} loading />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });
});

describe("DataTable (animations on)", () => {
  it("renders every row on desktop and phone with motion enabled", () => {
    act(() => setMatchMedia({ reducedMotion: false }));
    const { unmount } = render(<DataTable columns={columns} rows={rows} rowKey={(r) => String(r.id)} />);
    expect(bodyRows()).toHaveLength(3);
    unmount();
    act(() => setMatchMedia({ desktop: false }));
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => String(r.id)} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});

describe("DataTable (phone)", () => {
  it("renders each row as a card titled by the primary column, with mobile fields only", () => {
    act(() => setMatchMedia({ desktop: false }));
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => String(r.id)} rowHref={(r) => `/sales/${r.id}`} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(3);
    const first = cards[0];
    expect(within(first).getByRole("link", { name: /S-1/ })).toHaveAttribute("href", "/sales/1");
    expect(within(first).getByText("Cashier")).toBeInTheDocument();
    expect(within(first).getByText("RWF 1,000")).toBeInTheDocument();
    expect(within(first).queryByText("Date")).not.toBeInTheDocument();
  });

  it("keeps the sort order on phone", () => {
    act(() => setMatchMedia({ desktop: false }));
    render(
      <DataTable columns={columns} rows={rows} rowKey={(r) => String(r.id)} defaultSort={{ key: "total", dir: "desc" }} />
    );
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("S-2");
  });
});
