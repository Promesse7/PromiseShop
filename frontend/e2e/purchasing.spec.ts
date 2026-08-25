import { test, expect } from "@playwright/test";

/**
 * Requires the same fixture product Phase 2's checkout.spec.ts documents and depends on:
 * barcode PES-E2E-00001, name "E2E Test Speaker" (see checkout.spec.ts's doc comment to create
 * it), PLUS at least one Supplier record to pick from the New purchase dialog. Create a supplier
 * via (from the repo root, with the backend running):
 *   docker compose exec web python manage.py shell -c "
 *   from purchasing.models import Supplier
 *   Supplier.objects.get_or_create(name='E2E Test Supplier', defaults={'contact_person': 'Test Contact'})
 *   "
 */

test.describe("Purchasing", () => {
  test("admin creates a purchase, adds an existing product, and receives it", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept());

    await page.goto("/login");
    await page.getByLabel("Username").fill("admin1");
    await page.getByLabel("Password").fill("adminpass");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/dashboard");

    await page.goto("/purchases");
    await page.getByRole("button", { name: "+ New purchase" }).click();
    await page.getByLabel("Supplier").selectOption({ label: "E2E Test Supplier" });
    await page.getByLabel("Invoice number").fill("E2E-INV-0001");
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page).toHaveURL(/\/purchases\/\d+$/);
    await expect(page.getByText("Draft")).toBeVisible();

    await page.getByLabel("Search catalog first — reuse if it exists…").fill("E2E Test Speaker");
    await page.getByText(/E2E Test Speaker/).first().click();
    await page.getByLabel("Quantity").fill("2");
    await page.getByLabel("Buying price — paid / unit").fill("50000");
    await page.getByLabel("Buying price — on invoice / unit").fill("50000");
    await page.getByRole("button", { name: "Add to purchase" }).click();

    await expect(page.getByText("PES-E2E-00001")).toBeVisible();

    await page.getByRole("button", { name: "Receive purchase → stock increases" }).click();
    await expect(page.getByText("Received")).toBeVisible();
    await expect(page.getByRole("button", { name: "Receive purchase → stock increases" })).not.toBeVisible();

    await page.goto("/products");
    await page.getByLabel("Search products").fill("E2E Test Speaker");
    await page.getByRole("link", { name: "Open" }).click();
    await expect(page.getByText(/\d+/).first()).toBeVisible();
  });
});
