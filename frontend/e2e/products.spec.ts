import { test, expect } from "@playwright/test";
import { login, pageTitle } from "./helpers";

/**
 * Requires the fixture product from checkout.spec.ts: barcode PES-E2E-00001,
 * name "E2E Test Speaker".
 */
test.describe("Products", () => {
  test("admin can browse, open, edit a product, and see the change reflected", async ({ page }) => {
    await login(page, "admin");

    await page.goto("/products");
    await expect(pageTitle(page, "Products")).toBeVisible();
    await page.getByLabel("Search products").fill("E2E Test Speaker");
    // The catalog opens in the card grid by default; each card's title (an h3) holds the
    // link to the product page (the old "Open" links are gone).
    const card = page.getByRole("main").getByRole("heading", { name: "E2E Test Speaker" }).first();
    await expect(card).toBeVisible();
    await card.getByRole("link", { name: "E2E Test Speaker" }).click();

    await expect(page).toHaveURL(/\/products\/\d+$/);
    await expect(pageTitle(page, "E2E Test Speaker")).toBeVisible();

    await page.getByRole("main").getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit product" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Brand").fill("UpdatedBrandE2E");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog", { name: "Edit product" })).toHaveCount(0);

    // Overview is the default tab and shows Brand / model.
    await expect(page.getByRole("main").getByText(/UpdatedBrandE2E/).first()).toBeVisible();

    await page.goto("/products");
    await page.getByLabel("Search products").fill("E2E Test Speaker");
    await expect(page.getByRole("main").getByText(/UpdatedBrandE2E/).first()).toBeVisible();
  });
});
