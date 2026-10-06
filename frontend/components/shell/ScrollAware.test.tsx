import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePathname, useRouter } from "next/navigation";
import { TopBar } from "./TopBar";
import { TabBar } from "./TabBar";
import { Sidebar } from "./Sidebar";
import { useBottomChromeHidden } from "@/lib/scroll/chrome";

vi.mock("next/navigation", () => ({ usePathname: vi.fn(), useRouter: vi.fn() }));
vi.mock("@/lib/scroll/chrome", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scroll/chrome")>();
  return { ...actual, useBottomChromeHidden: vi.fn(() => false) };
});

beforeEach(() => {
  vi.mocked(usePathname).mockReturnValue("/products");
  vi.mocked(useRouter).mockReturnValue({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() } as unknown as ReturnType<
    typeof useRouter
  >);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ count: 0, next: null, results: [] }) }));
  vi.mocked(useBottomChromeHidden).mockReturnValue(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

function renderTopBar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TopBar role="admin" username="admin1" onOpenSearch={vi.fn()} onOpenHelp={vi.fn()} onLogout={vi.fn()} loggingOut={false} />
    </QueryClientProvider>
  );
}

describe("TopBar is scroll-aware", () => {
  it("is flat at the top of the page", () => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    renderTopBar();
    const bar = screen.getByTestId("top-bar");
    expect(bar).toHaveAttribute("data-scrolled", "false");
    expect(bar.className).not.toContain("shadow-md");
    expect(bar.className).not.toContain("glass-bar");
  });

  it("frosts and gains a shadow once the page has scrolled", () => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 120 });
    renderTopBar();
    const bar = screen.getByTestId("top-bar");
    expect(bar).toHaveAttribute("data-scrolled", "true");
    expect(bar.className).toContain("shadow-md");
    expect(bar.className).toContain("glass-bar");
  });
});

describe("TabBar hides on scroll-down", () => {
  it("is shown while the chrome is visible", () => {
    render(<TabBar role="sales_staff" onMore={vi.fn()} />);
    expect(screen.getByRole("navigation", { name: "Quick navigation" })).toHaveAttribute("data-hidden", "false");
  });

  it("slides away while the user scrolls down", () => {
    vi.mocked(useBottomChromeHidden).mockReturnValue(true);
    render(<TabBar role="sales_staff" onMore={vi.fn()} />);
    expect(screen.getByRole("navigation", { name: "Quick navigation" })).toHaveAttribute("data-hidden", "true");
  });
});

describe("Sidebar keeps the active item in view", () => {
  it("scrolls the active link into view on route change", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.mocked(usePathname).mockReturnValue("/notifications");
    const { rerender } = render(<Sidebar role="admin" collapsed={false} onToggle={vi.fn()} />);
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "nearest" }));
    const target = scrollIntoView.mock.contexts[scrollIntoView.mock.contexts.length - 1] as HTMLElement;
    expect(target).toHaveAttribute("aria-current", "page");
    expect(target).toHaveTextContent("Notifications");

    scrollIntoView.mockClear();
    vi.mocked(usePathname).mockReturnValue("/checkout");
    rerender(<Sidebar role="admin" collapsed={false} onToggle={vi.fn()} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
