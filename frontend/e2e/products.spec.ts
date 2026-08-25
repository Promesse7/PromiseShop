import { test, expect } from "@playwright/test";

/**
 * Requires the same fixture product Phase 2's checkout.spec.ts documents and depends on:
 * barcode PES-E2E-00001, name "E2E Test Speaker". See frontend/e2e/checkout.spec.ts's doc
 * comment for the exact creation command if it doesn't already exist in the dev database.
 */

test.describe("Products", () => {
  test("admin can browse, open, and edit a product", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin1");
    await page.getByLabel("Password").fill("adminpass");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/dashboard");

    await page.goto("/products");
    await page.getByLabel("Search products").fill("E2E Test Speaker");
    await expect(page.getByRole("table").getByText("E2E Test Speaker")).toBeVisible();

    await page.getByRole("link", { name: "Open" }).click();
    await expect(page.getByRole("heading", { name: "E2E Test Speaker" })).toBeVisible();

    await page.getByRole("button", { name: "Edit" }).first().click();
    const descriptionField = page.getByLabel("Description");
    await descriptionField.fill("Updated via e2e test");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Edit product")).not.toBeVisible();
  });
});
