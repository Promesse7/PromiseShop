import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TabBar } from "./TabBar";
import { MoreSheet } from "./MoreSheet";
import { TopBar } from "./TopBar";
import { AppShell } from "./AppShell";
import { setMatchMedia } from "@/lib/test/matchMedia";

vi.mock("next/navigation", () => ({ usePathname: vi.fn(), useRouter: vi.fn() }));

const push = vi.fn();
const back = vi.fn();

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(usePathname).mockReturnValue("/products/12");
  vi.mocked(useRouter).mockReturnValue({ push, back, refresh: vi.fn() } as unknown as ReturnType<typeof useRouter>);
  push.mockReset();
  back.mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ count: 0, next: null, results: [] }) }));
});

function withQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("Sidebar", () => {
  it("shows the role's groups and marks the parent of a detail page active", () => {
    render(<Sidebar role="manager" collapsed={false} onToggle={vi.fn()} />);
    const nav = screen.getByRole("complementary", { name: "Main navigation" });
    for (const group of ["Sell", "Stock", "Buy", "Money"]) expect(within(nav).getByText(group, { selector: "p" })).toBeInTheDocument();
    expect(within(nav).queryByText("Admin")).not.toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Products" })).toHaveAttribute("aria-current", "page");
  });

  it("collapses to icons with tooltips, and the toggle reports the next state", async () => {
    const onToggle = vi.fn();
    render(<Sidebar role="admin" collapsed onToggle={onToggle} />);
    expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute("title", "Products");
    await userEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(onToggle).toHaveBeenCalled();
  });
});

describe("TabBar and More", () => {
  it("gives staff their four shortcuts plus More", () => {
    vi.mocked(usePathname).mockReturnValue("/checkout");
    render(<TabBar role="sales_staff" onMore={vi.fn()} />);
    const bar = screen.getByRole("navigation", { name: "Quick navigation" });
    expect(within(bar).getAllByRole("link").map((a) => a.textContent)).toEqual(["Checkout", "My sales", "Products", "Stock"]);
    expect(within(bar).getByRole("link", { name: "Checkout" })).toHaveAttribute("aria-current", "page");
    expect(within(bar).getByRole("button", { name: "More" })).toBeInTheDocument();
  });

  it("marks More active when the page isn't one of the shortcuts", () => {
    vi.mocked(usePathname).mockReturnValue("/suppliers");
    render(<TabBar role="admin" onMore={vi.fn()} />);
    expect(screen.getByRole("button", { name: "More" })).toHaveAttribute("aria-current", "page");
  });

  it("More lists every group the role can reach, plus help and sign out", async () => {
    const onLogout = vi.fn();
    render(<MoreSheet open onClose={vi.fn()} role="admin" username="admin1" onHelp={vi.fn()} onLogout={onLogout} loggingOut={false} />);
    for (const group of ["Sell", "Stock", "Buy", "Money", "Admin"]) expect(screen.getByText(group, { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Employees" })).toHaveAttribute("href", "/employees");
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onLogout).toHaveBeenCalled();
  });
});

describe("TopBar", () => {
  function renderTopBar(role: "admin" | "sales_staff" = "admin") {
    return render(
      withQuery(
        <TopBar role={role} username="admin1" onOpenSearch={vi.fn()} onOpenHelp={vi.fn()} onLogout={vi.fn()} loggingOut={false} />
      )
    );
  }

  it("shows a breadcrumb that links back to the list from a detail page", () => {
    renderTopBar();
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByText("Stock")).toBeInTheDocument();
    expect(within(crumbs).getByRole("link", { name: "Products" })).toHaveAttribute("href", "/products");
  });

  it("back goes to the parent list when there is no history (a deep link)", async () => {
    setMatchMedia({ desktop: false });
    Object.defineProperty(window.history, "length", { configurable: true, value: 1 });
    renderTopBar();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(push).toHaveBeenCalledWith("/products");
    expect(back).not.toHaveBeenCalled();
  });

  it("back uses browser history when there is some", async () => {
    Object.defineProperty(window.history, "length", { configurable: true, value: 3 });
    renderTopBar();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(back).toHaveBeenCalled();
  });

  it("shows the notifications bell to admin only", () => {
    const { unmount } = renderTopBar("admin");
    expect(screen.getByRole("link", { name: /Notifications/ })).toBeInTheDocument();
    unmount();
    renderTopBar("sales_staff");
    expect(screen.queryByRole("link", { name: /Notifications/ })).not.toBeInTheDocument();
  });
});

describe("AppShell", () => {
  it("renders the page inside the shell with sidebar, top bar and tab bar", () => {
    render(withQuery(<AppShell role="admin" username="admin1"><p>Page body</p></AppShell>));
    expect(screen.getByText("Page body")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Main navigation" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Quick navigation" })).toBeInTheDocument();
  });

  it("remembers the collapsed sidebar on this device", async () => {
    const { unmount } = render(withQuery(<AppShell role="admin" username="admin1"><p>x</p></AppShell>));
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    unmount();
    render(withQuery(<AppShell role="admin" username="admin1"><p>x</p></AppShell>));
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
  });

  it("opens jump search with Ctrl+K and the More sheet from the tab bar", async () => {
    render(withQuery(<AppShell role="admin" username="admin1"><p>x</p></AppShell>));
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(screen.getByRole("dialog", { name: "Jump search" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeInTheDocument();
  });

  it("signs out through the logout endpoint", async () => {
    render(withQuery(<AppShell role="admin" username="admin1"><p>x</p></AppShell>));
    await userEvent.click(screen.getByRole("button", { name: /admin1/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(fetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
    expect(push).toHaveBeenCalledWith("/login");
  });
});
