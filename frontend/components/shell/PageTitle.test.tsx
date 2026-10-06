import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePathname, useRouter } from "next/navigation";
import { TopBar } from "./TopBar";
import { PageTitleProvider } from "./PageTitleContext";
import { Page } from "@/components/ui/Page";
import { setMatchMedia } from "@/lib/test/matchMedia";

vi.mock("next/navigation", () => ({ usePathname: vi.fn(), useRouter: vi.fn() }));

type ObserverCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;
let observerCallbacks: ObserverCallback[] = [];

class FakeIntersectionObserver {
  constructor(callback: ObserverCallback) {
    observerCallbacks.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  observerCallbacks = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.mocked(usePathname).mockReturnValue("/products/12");
  vi.mocked(useRouter).mockReturnValue({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() } as unknown as ReturnType<
    typeof useRouter
  >);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ count: 0, next: null, results: [] }) }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderShellWithPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PageTitleProvider>
        <TopBar role="admin" username="admin1" onOpenSearch={vi.fn()} onOpenHelp={vi.fn()} onLogout={vi.fn()} loggingOut={false} />
        <Page title="E2E Test Speaker">
          <p>body</p>
        </Page>
      </PageTitleProvider>
    </QueryClientProvider>
  );
}

function reportTitleVisible(visible: boolean) {
  act(() => {
    for (const callback of observerCallbacks) callback([{ isIntersecting: visible }]);
  });
}

describe("title tuck", () => {
  it("keeps the top bar title hidden while the page heading is on screen", () => {
    renderShellWithPage();
    reportTitleVisible(true);
    expect(screen.queryByTestId("tucked-title")).not.toBeInTheDocument();
  });

  it("shows the page title in the top bar once the heading scrolls out of view (desktop)", () => {
    renderShellWithPage();
    reportTitleVisible(false);
    expect(screen.getByTestId("tucked-title")).toHaveTextContent("E2E Test Speaker");
    reportTitleVisible(true);
    expect(screen.queryByTestId("tucked-title")).not.toBeInTheDocument();
  });

  it("swaps the phone bar title from the section to the page title", () => {
    setMatchMedia({ desktop: false });
    renderShellWithPage();
    expect(screen.getByTestId("phone-title")).toHaveTextContent("Products");
    reportTitleVisible(false);
    expect(screen.getByTestId("phone-title")).toHaveTextContent("E2E Test Speaker");
  });

  it("a Page outside the shell still renders (no provider needed)", () => {
    render(
      <Page title="Standalone">
        <p>x</p>
      </Page>
    );
    expect(screen.getByRole("heading", { level: 1, name: "Standalone" })).toBeInTheDocument();
  });
});
