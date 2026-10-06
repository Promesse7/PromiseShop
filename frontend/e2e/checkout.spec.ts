import { test, expect } from "@playwright/test";
import { isPhone, login, pageTitle } from "./helpers";

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
 *
 * The sale is a walk-in cash sale at the catalog price: the payment panel defaults to one cash
 * line for the full amount, and no discount means no manager PIN is needed.
 */
test.describe("Checkout", () => {
  test("staff can scan a product, complete a sale, and see the receipt", async ({ page }, testInfo) => {
    const phone = isPhone(testInfo);
    await login(page, "staff");
    await expect(pageTitle(page, "New sale")).toBeVisible();

    const scan = page.getByLabel("Scan barcode or search product");
    await scan.fill("PES-E2E-00001");
    await scan.press("Enter");

    if (phone) {
      // Phone: the cart is a list of line cards and a sticky "Sale total" bar opens the Payment sheet.
      await expect(page.getByRole("main").getByText("E2E Test Speaker").first()).toBeVisible();
      await page.getByRole("region", { name: "Sale total" }).getByRole("button", { name: "Pay →" }).click();
      const sheet = page.getByRole("dialog", { name: "Payment" });
      await expect(sheet).toBeVisible();
      await sheet.getByRole("button", { name: "Complete sale" }).click();
    } else {
      // Desktop: the cart is a table and Complete sale sits in the right-hand column.
      await expect(page.getByRole("table").getByText("E2E Test Speaker")).toBeVisible();
      await page.getByRole("button", { name: "Complete sale" }).click();
    }

    await expect(pageTitle(page, "Sale complete")).toBeVisible();
    await expect(page.getByText(/Sale #S-\d+ completed/)).toBeVisible();
    await expect(page.getByText("RWF 75,000").first()).toBeVisible();

    await page.getByRole("button", { name: "New sale" }).click();
    await expect(pageTitle(page, "New sale")).toBeVisible();
    await expect(page.getByLabel("Scan barcode or search product")).toHaveValue("");
    await expect(page.getByRole("main").getByText("No items scanned yet")).toBeVisible();
  });
});
