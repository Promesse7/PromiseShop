import { test, expect } from "@playwright/test";

/**
 * Requires an admin fixture (admin1/adminpass, already used by e2e/login.spec.ts and
 * e2e/products.spec.ts) and at least one completed sale and one purchase in the dev database
 * so the stat cards render non-empty. No new fixture data is required beyond what those specs
 * already document creating.
 */
test.describe("Dashboard", () => {
  test("admin sees the monthly stat cards and top sellers table", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin1");
    await page.getByLabel("Password").fill("adminpass");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/dashboard");

    await expect(page.getByText("Sales revenue", { exact: true })).toBeVisible();
    await expect(page.getByText("Purchase cost", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Gross profit", { exact: true })).toBeVisible();
    await expect(page.getByText("Needs reorder", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
  });
});
