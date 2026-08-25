import { test, expect } from "@playwright/test";

/**
 * Requires the same fixture product Phase 2's checkout.spec.ts documents and depends on:
 * barcode PES-E2E-00001, name "E2E Test Speaker" (see checkout.spec.ts's doc comment to create
 * it), PLUS at least one EquipmentUnit for that product so it shows up as "serialized" on /stock.
 * Create one via (from the repo root, with the backend running):
 *   docker compose exec web python manage.py shell -c "
 *   from catalog.models import Product
 *   from stock.models import EquipmentUnit
 *   product = Product.objects.get(barcode='PES-E2E-00001')
 *   unit, created = EquipmentUnit.objects.get_or_create(
 *       product=product, serial_number='E2E-UNIT-0001', defaults={'status': 'in_stock'}
 *   )
 *   "
 */

test.describe("Stock & Equipment", () => {
  test("admin can view a product's serialized units, open one, and change its status", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin1");
    await page.getByLabel("Password").fill("adminpass");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/dashboard");

    await page.goto("/stock");
    await page.getByRole("radio", { name: "Serialized only" }).click();
    await expect(page.getByText("E2E Test Speaker")).toBeVisible();

    // Scoped to this product's row — another product in the dev DB can also carry a lone
    // serialized unit, which would otherwise make a bare "N units" button locator ambiguous.
    await page.getByRole("row", { name: /E2E Test Speaker/ }).getByRole("button", { name: /\d+ units/ }).click();
    await expect(page.getByText(/Serialized units — E2E Test Speaker/)).toBeVisible();
    await expect(page.getByText("E2E-UNIT-0001")).toBeVisible();

    await Promise.all([
      page.waitForURL(/\/stock\/units\/\d+$/),
      page.getByRole("link", { name: "History" }).first().click(),
    ]);
    await expect(page.getByRole("heading", { name: /E2E-UNIT-0001/ })).toBeVisible();

    await page.getByRole("button", { name: "Change status" }).click();
    await page.getByLabel("Under repair").click();
    await page.getByLabel("Reason (required — goes to history)").fill("E2E: sent for repair");
    await page.getByRole("button", { name: "Save change" }).click();
    await expect(page.getByTestId("dialog-backdrop")).not.toBeVisible();

    // Scoped to the header (sibling of the unit heading) — "under repair" also legitimately
    // appears in the freshly-written history entry below, which would otherwise be ambiguous.
    const header = page.getByRole("heading", { name: /E2E-UNIT-0001/ }).locator("..");
    await expect(header.getByText("under repair")).toBeVisible();
    await expect(page.getByTestId("history-entry").first().getByText("E2E: sent for repair")).toBeVisible();
  });
});
