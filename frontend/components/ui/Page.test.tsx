import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Page, Toolbar } from "./Page";
import { Button } from "./Button";
import { setMatchMedia } from "@/lib/test/matchMedia";

describe("Page", () => {
  it("renders the title, description, primary action and content", () => {
    render(
      <Page title="Purchases" description="Stock coming in from suppliers" primaryAction={<Button>+ New purchase</Button>}>
        <p>list</p>
      </Page>
    );
    expect(screen.getByRole("heading", { level: 1, name: "Purchases" })).toBeInTheDocument();
    expect(screen.getByText("Stock coming in from suppliers")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ New purchase" })).toBeInTheDocument();
    expect(screen.getByText("list")).toBeInTheDocument();
  });

  it("lists secondary actions in a ⋯ menu and runs the chosen one", async () => {
    const onExport = vi.fn();
    render(
      <Page title="Sales" secondaryActions={[{ label: "Export CSV", onSelect: onExport }, { label: "Print", onSelect: vi.fn() }]}>
        x
      </Page>
    );
    expect(screen.queryByRole("menuitem", { name: "Export CSV" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Export CSV" }));
    expect(onExport).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the ⋯ menu on Escape", async () => {
    render(
      <Page title="Sales" secondaryActions={[{ label: "Export CSV", onSelect: vi.fn() }]}>
        x
      </Page>
    );
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("shows a breadcrumb and a back link when given", () => {
    render(
      <Page title="Sale #S-12" breadcrumb={[{ label: "Sell" }, { label: "Sales", href: "/sales" }, { label: "#S-12" }]} back="/sales">
        x
      </Page>
    );
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByRole("link", { name: "Sales" })).toHaveAttribute("href", "/sales");
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/sales");
  });

  it("keeps the title an h1 when it is a shared element (detail pages)", () => {
    render(
      <Page title="JBL Flip 6" sharedName="product-12">
        <p>Body</p>
      </Page>
    );
    expect(screen.getByRole("heading", { level: 1, name: "JBL Flip 6" })).toBeInTheDocument();
  });

  it("renders the toolbar between the header and the content", () => {
    render(
      <Page title="Products" toolbar={<Toolbar search={<input aria-label="Search products" />} />}>
        <p>grid</p>
      </Page>
    );
    expect(screen.getByLabelText("Search products")).toBeInTheDocument();
  });
});

describe("Toolbar", () => {
  it("shows search, filters and trailing controls in one row on desktop", () => {
    render(
      <Toolbar
        search={<input aria-label="Search" />}
        filters={<button>Low stock</button>}
        activeFilterCount={1}
        trailing={<button>Grid</button>}
      />
    );
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Low stock" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Grid" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Filters/ })).not.toBeInTheDocument();
  });

  it("collapses filters into a Filters (n) sheet on phone", async () => {
    act(() => setMatchMedia({ desktop: false }));
    render(<Toolbar search={<input aria-label="Search" />} filters={<button>Low stock</button>} activeFilterCount={2} />);
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Low stock" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Filters (2)" }));
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    expect(within(sheet).getByRole("button", { name: "Low stock" })).toBeInTheDocument();
  });

  it("says just Filters on phone when none are active", () => {
    act(() => setMatchMedia({ desktop: false }));
    render(<Toolbar filters={<button>Low stock</button>} activeFilterCount={0} />);
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
  });
});
