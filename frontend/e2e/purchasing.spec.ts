import { test, expect } from "@playwright/test";
import { confirmDialog, isPhone, login, pageTitle } from "./helpers";

/**
 * Requires the fixture product from checkout.spec.ts (barcode PES-E2E-00001, "E2E Test Speaker")
 * PLUS a supplier named "E2E Test Supplier" (directory.spec.ts creates one, or:
 *   docker compose exec web python manage.py shell -c "
 *   from purchasing.models import Supplier
 *   Supplier.objects.get_or_create(name='E2E Test Supplier', defaults={'contact_person': 'Test Contact'})
 *   ").
 */
test.describe("Purchasing", () => {
  test("admin creates a purchase, adds an existing product, and receives it", async ({ page }, testInfo) => {
    const phone = isPhone(testInfo);
    await login(page, "admin");

    await page.goto("/purchases");
    await expect(pageTitle(page, "Purchases")).toBeVisible();
    await page.getByRole("button", { name: "+ New purchase" }).click();
    const newDialog = page.getByRole("dialog", { name: "New purchase" });
    // .first(): repeated directory.spec.ts runs can leave several same-named suppliers.
    const supplierSelect = newDialog.getByLabel("Supplier", { exact: true });
    const supplierValue = await supplierSelect
      .locator("option", { hasText: "E2E Test Supplier" })
      .first()
      .getAttribute("value");
    await supplierSelect.selectOption(supplierValue!);
    await newDialog.getByLabel("Invoice number").fill("E2E-INV-0001");
    await newDialog.getByRole("button", { name: "Create" }).click();

    await expect(page).toHaveURL(/\/purchases\/\d+$/);
    await expect(page.getByRole("main").getByText("Draft", { exact: true }).filter({ visible: true }).first()).toBeVisible();

    // Single mode (the default) searches the catalog first.
    await page.getByLabel("Search catalog first — reuse if it exists…").fill("E2E Test Speaker");
    // Match by barcode specifically — a loose name-only locator can also match the
    // "+ Add ... as a new product" fallback button that contains the same search text.
    await page.getByRole("button", { name: /PES-E2E-00001/ }).first().click();
    await page.getByLabel("Quantity", { exact: true }).fill("2");
    await page.getByLabel("Buying price — paid / unit").fill("50000");
    await page.getByLabel("Buying price — on invoice / unit").fill("50000");
    await page.getByRole("button", { name: "Add to purchase" }).click();

    await expect(page.getByRole("region", { name: "On this purchase" }).getByText("E2E Test Speaker").first()).toBeVisible();

    // Receive: the side summary on desktop, the sticky bar on phone; both confirm in-app.
    if (phone) {
      await page.getByRole("region", { name: "Purchase summary" }).getByRole("button", { name: "Receive →" }).click();
    } else {
      await page.getByRole("button", { name: "Receive purchase → stock increases" }).click();
    }
    await confirmDialog(page, "Receive this purchase?", "Receive");

    // After receiving, the "Stock received" dialog offers labels/serials; dismiss it.
    const receivedDialog = page.getByRole("dialog", { name: "Stock received" });
    await expect(receivedDialog).toBeVisible();
    await receivedDialog.getByRole("button", { name: "Done" }).click();

    await expect(page.getByRole("main").getByText("Received", { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Receive/ })).toHaveCount(0);
  });
});
