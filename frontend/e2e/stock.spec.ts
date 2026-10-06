import { test, expect } from "@playwright/test";
import { closeFilters, dataView, filtersScope, isPhone, login, pageTitle } from "./helpers";

/**
 * Requires the fixture product from checkout.spec.ts (barcode PES-E2E-00001, "E2E Test Speaker")
 * PLUS at least one EquipmentUnit for it so it shows up as "serialized" on /stock:
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
  test("admin can view a product's serialized units, open one, and change its status", async ({ page }, testInfo) => {
    const phone = isPhone(testInfo);
    await login(page, "admin");

    await page.goto("/stock");
    await expect(pageTitle(page, "Stock")).toBeVisible();
    const filters = await filtersScope(page, phone);
    await filters.getByRole("radio", { name: "Serialized only" }).click();
    await closeFilters(page, phone);

    // Stock cards: the product name is an h3 holding a link to the product. Walk up to the
    // card that also holds the "N units" button (another product can carry units too).
    const heading = page.getByRole("main").getByRole("heading", { name: "E2E Test Speaker" }).first();
    await expect(heading).toBeVisible();
    const card = heading.locator("xpath=ancestor::div[.//button[contains(., 'units')]][1]");
    await card.getByRole("button", { name: /\d+ units/ }).click();
    await expect(page.getByRole("heading", { name: "Serialized units — E2E Test Speaker" })).toBeVisible();

    // The units DataTable: the serial cell links to the unit (desktop); the whole card is the
    // link on phone.
    const units = dataView(page, phone, "Serialized units");
    await expect(units.getByText("E2E-UNIT-0001")).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/stock\/units\/\d+$/),
      units.getByRole("link", { name: /E2E-UNIT-0001/ }).first().click(),
    ]);
    await expect(pageTitle(page, "Unit E2E-UNIT-0001")).toBeVisible();

    await page.getByRole("button", { name: "Change status" }).click();
    const dialog = page.getByRole("dialog", { name: "Change status" });
    await dialog.getByLabel("Under repair").click();
    await dialog.getByLabel("Reason (required — goes to history)").fill("E2E: sent for repair");
    await dialog.getByRole("button", { name: "Save change" }).click();
    await expect(page.getByRole("dialog", { name: "Change status" })).toHaveCount(0);

    // The status sits in the "Unit details" strip; the reason lands in the history timeline.
    await expect(page.getByRole("list", { name: "Unit details" }).getByText("under repair")).toBeVisible();
    await expect(page.getByTestId("history-entry").first().getByText("E2E: sent for repair")).toBeVisible();
  });
});
