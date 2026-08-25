import { test, expect } from "@playwright/test";

test.describe("Checkout", () => {
  test("staff can scan a product, complete a sale, and see the receipt", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("staff1");
    await page.getByLabel("Password").fill("staffpass");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/checkout");

    await page.getByLabel("Scan barcode or search product").fill("PES-E2E-00001");
    await page.getByLabel("Scan barcode or search product").press("Enter");
    await expect(page.getByRole("table").getByText("E2E Test Speaker")).toBeVisible();

    await page.getByRole("button", { name: "Complete sale" }).click();

    await expect(page.getByText(/Sale #S-\d+ completed/)).toBeVisible();
    await expect(page.getByText("RWF 75,000")).toBeVisible();

    await page.getByRole("button", { name: "New sale" }).click();
    await expect(page.getByLabel("Scan barcode or search product")).toHaveValue("");
    await expect(page.getByRole("table").getByText("No items scanned yet")).toBeVisible();
  });
});
