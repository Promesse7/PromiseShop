import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";

/**
 * Shared helpers for the e2e specs. Every spec runs in two Playwright projects:
 * "desktop" (1280×800, grouped sidebar) and "phone" (390×844, bottom tab bar + More sheet).
 * The app picks its layout from `matchMedia("(min-width: 1024px)")`, so phone and desktop
 * render different markup for the same screen (DataTable → cards, Toolbar filters → a sheet).
 */

export const USERS = {
  admin: { username: "admin1", password: "adminpass" },
  manager: { username: "manager1", password: "managerpass" },
  staff: { username: "staff1", password: "staffpass" },
} as const;

export type UserKey = keyof typeof USERS;

export function isPhone(testInfo: TestInfo): boolean {
  return testInfo.project.name === "phone";
}

/** Signs in and waits for the role's landing page (admin/manager → /dashboard, staff → /checkout). */
export async function login(page: Page, who: UserKey): Promise<void> {
  const { username, password } = USERS[who];
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(who === "staff" ? "/checkout" : "/dashboard");
}

/** The page's own title: every screen renders it as the single <h1> via <Page>. */
export function pageTitle(page: Page, name: string | RegExp): Locator {
  return page.getByRole("heading", { level: 1, name });
}

/**
 * The navigation for the current layout: the sidebar (an <aside aria-label="Main navigation">)
 * on desktop, the bottom tab bar (<nav aria-label="Quick navigation">) on phone. The other one
 * is display:none at that width, so role queries ignore it.
 */
export function mainNav(page: Page, phone: boolean): Locator {
  return phone
    ? page.getByRole("navigation", { name: "Quick navigation" })
    : page.getByRole("complementary", { name: "Main navigation" });
}

/** Phone: opens the More sheet (a Dialog titled "Menu") and returns it. */
export async function openMoreSheet(page: Page): Promise<Locator> {
  await page.getByRole("navigation", { name: "Quick navigation" }).getByRole("button", { name: "More" }).click();
  const sheet = page.getByRole("dialog", { name: "Menu" });
  await expect(sheet).toBeVisible();
  return sheet;
}

/**
 * Where a screen's Toolbar filters live: inline on desktop, inside a "Filters" sheet on phone
 * (opened from a "Filters" / "Filters (n)" button). Returns the scope to query filters in.
 */
export async function filtersScope(page: Page, phone: boolean): Promise<Locator> {
  if (!phone) return page.getByRole("main");
  await page.getByRole("main").getByRole("button", { name: /^Filters/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Closes the phone Filters sheet (its X button), so the list underneath is reachable again. */
export async function closeFilters(page: Page, phone: boolean): Promise<void> {
  if (!phone) return;
  await page.getByRole("dialog", { name: "Filters" }).getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByRole("dialog", { name: "Filters" })).toHaveCount(0);
}

/**
 * A DataTable by its accessible label: a <table aria-label> on desktop, a <ul aria-label> of
 * cards on phone.
 */
export function dataView(page: Page, phone: boolean, label: string): Locator {
  return phone ? page.getByRole("list", { name: label }) : page.getByRole("table", { name: label });
}

/** Clicks the confirm button of a useConfirm dialog (an in-app Dialog, not window.confirm). */
export async function confirmDialog(page: Page, title: string | RegExp, confirmLabel: string): Promise<void> {
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: confirmLabel, exact: true }).click();
  await expect(page.getByRole("dialog", { name: title })).toHaveCount(0);
}

/** Calls the backend through the app's BFF proxy with the signed-in page's cookies. */
export async function apiGet<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/api/proxy/${path}`);
  expect(response.ok(), `GET /api/proxy/${path} → ${response.status()}`).toBeTruthy();
  return (await response.json()) as T;
}

/** The fixture product's id (barcode PES-E2E-00001), via the ranked product search. */
export async function fixtureProductId(page: Page): Promise<number> {
  const data = await apiGet<{ results: { product_id: number; barcode: string }[] }>(
    page,
    "products/search/?q=PES-E2E-00001&limit=1"
  );
  const match = data.results.find((p) => p.barcode === "PES-E2E-00001");
  expect(match, "fixture product PES-E2E-00001 must exist (see checkout.spec.ts)").toBeTruthy();
  return match!.product_id;
}

/** Waits until no loading skeleton (LoadingState: role=status, aria-busy=true) is on screen. */
export async function waitForContent(page: Page): Promise<void> {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}
