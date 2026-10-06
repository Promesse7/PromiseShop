import { test, expect, type Page } from "@playwright/test";
import { apiGet, fixtureProductId, isPhone, login, waitForContent } from "./helpers";

/**
 * Screenshots of every main screen at both sizes, for reviewing the UI refactor.
 * Tagged @screenshots, so normal runs skip it. Run it with:
 *   SCREENSHOTS=1 npx playwright test --workers=1
 * Output: test-results/ui-review/<desktop|phone>/<route>.png (full page).
 */

const SHOT_DIR = "test-results/ui-review";

async function shoot(page: Page, project: string, name: string, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await waitForContent(page);
  // Let list stagger, count-ups and the route transition settle (all ≤ 300ms).
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOT_DIR}/${project}/${name}.png`, fullPage: true });
}

async function firstId(page: Page, path: string, key: string): Promise<number | null> {
  const data = await apiGet<{ results: Record<string, unknown>[] }>(page, path);
  const first = data.results[0];
  return first ? Number(first[key]) : null;
}

test.describe("UI review screenshots @screenshots", () => {
  test("every main screen as admin", async ({ page }, testInfo) => {
    test.setTimeout(10 * 60_000);
    const project = testInfo.project.name;
    await login(page, "admin");

    const saleId = await firstId(page, "sales/?page_size=1", "sale_id");
    const purchaseId = await firstId(page, "purchases/?page_size=1", "purchase_id");
    const productId = await fixtureProductId(page);

    const routes: [string, string | null][] = [
      ["dashboard", "/dashboard"],
      ["checkout", "/checkout"],
      ["sales", "/sales"],
      ["sale-detail", saleId ? `/sales/${saleId}` : null],
      ["close-day", "/close-day"],
      ["customers", "/customers"],
      ["debts", "/debts"],
      ["products", "/products"],
      ["product-detail", `/products/${productId}`],
      ["stock", "/stock"],
      ["stock-movements", "/stock/movements"],
      ["shop-use", "/shop-use"],
      ["purchases", "/purchases"],
      ["purchase-workspace", purchaseId ? `/purchases/${purchaseId}` : null],
      ["suppliers", "/suppliers"],
      ["expenses", "/expenses"],
      ["employees", "/employees"],
      ["settings", "/settings"],
      ["setup-import", "/setup/import"],
      ["notifications", "/notifications"],
    ];

    for (const [name, path] of routes) {
      if (!path) {
        testInfo.annotations.push({ type: "skipped-shot", description: `${name}: no record to open` });
        continue;
      }
      await test.step(name, () => shoot(page, project, name, path));
    }
  });

  test("checkout as staff on phone", async ({ page }, testInfo) => {
    test.skip(!isPhone(testInfo), "The staff till screenshot is phone-only.");
    await login(page, "staff");
    await shoot(page, testInfo.project.name, "checkout-staff", "/checkout");
  });
});
