import { test, expect } from "@playwright/test";

/**
 * Requires a fixture product in the dev database (not auto-created):
 *   barcode PES-E2E-00001, name "E2E Test Speaker", current retail price 75000.00,
 *   inventory quantity_in_stock >= 1.
 *
 * Create it via (from the repo root, with the backend running):
 *   docker compose exec web python manage.py shell -c "
 *   from catalog.models import Category, Product, ProductPricing
 *   from stock.models import Inventory
 *   from datetime import date
 *   category, _ = Category.objects.get_or_create(code='AUD', defaults={'name': 'Audio'})
 *   product, _ = Product.objects.get_or_create(barcode='PES-E2E-00001', defaults={'category': category, 'name': 'E2E Test Speaker', 'brand': 'TestBrand'})
 *   ProductPricing.objects.get_or_create(product=product, is_current=True, defaults={'wholesale_price': '50000.00', 'retail_price': '75000.00', 'effective_date': date(2026, 1, 1)})
 *   Inventory.objects.get_or_create(product=product, defaults={'quantity_in_stock': 100})
 *   "
 */
test.describe("Checkout", () => {
  test("staff can scan a product, complete a sale, and see the receipt", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("staff1");
    await page.getByLabel("Password").fill("staffpass");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/checkout");

    await page.getByLabel("Scan barcode or search product").fill("PES-E2E-00001");
    await page.getByLabel("Scan barcode or search product").press("Enter");
    // Scoped to the table: CartTable and CartCards both exist in the DOM (CSS-only responsive split), so a bare getByText matches both and Playwright's strict mode rejects the ambiguity.
    await expect(page.getByRole("table").getByText("E2E Test Speaker")).toBeVisible();

    await page.getByRole("button", { name: "Complete sale" }).click();

    await expect(page.getByText(/Sale #S-\d+ completed/)).toBeVisible();
    await expect(page.getByText("RWF 75,000")).toBeVisible();

    await page.getByRole("button", { name: "New sale" }).click();
    await expect(page.getByLabel("Scan barcode or search product")).toHaveValue("");
    // Scoped to the table: CartTable and CartCards both exist in the DOM (CSS-only responsive split), so a bare getByText matches both and Playwright's strict mode rejects the ambiguity.
    await expect(page.getByRole("table").getByText("No items scanned yet")).toBeVisible();
  });
});
