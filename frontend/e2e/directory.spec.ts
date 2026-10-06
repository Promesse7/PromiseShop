import { test, expect } from "@playwright/test";
import { login, pageTitle } from "./helpers";

test.describe("Directory (Suppliers/Customers/Employees)", () => {
  // Phase 0: only admin/manager may create suppliers, so this runs as admin.
  test("admin can create a supplier and see it in the list", async ({ page }) => {
    await login(page, "admin");

    await page.goto("/suppliers");
    await expect(pageTitle(page, "Suppliers")).toBeVisible();
    await page.getByRole("button", { name: "+ New supplier" }).click();
    const dialog = page.getByRole("dialog", { name: "New supplier" });
    await dialog.getByLabel("Name").fill("E2E Test Supplier");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog", { name: "New supplier" })).toHaveCount(0);

    // Search scopes to this run's row — repeated runs against a shared dev DB otherwise
    // accumulate same-named rows and make a bare locator ambiguous.
    await page.getByLabel("Search suppliers").fill("E2E Test Supplier");
    // Suppliers render as cards; each card's name is a heading.
    await expect(page.getByRole("main").getByRole("heading", { name: "E2E Test Supplier" }).first()).toBeVisible();
  });

  test("admin can create a customer and see it in the list", async ({ page }) => {
    await login(page, "admin");

    await page.goto("/customers");
    await expect(pageTitle(page, "Customers")).toBeVisible();
    await page.getByRole("button", { name: "+ New customer" }).click();
    const dialog = page.getByRole("dialog", { name: "New customer" });
    await dialog.getByLabel("Name").fill("E2E Test Customer");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog", { name: "New customer" })).toHaveCount(0);

    await page.getByLabel("Search customers").fill("E2E Test Customer");
    // Customer cards: the customer's name is the link to their page.
    await expect(
      page.getByRole("list", { name: "Customers" }).getByRole("link", { name: "E2E Test Customer" }).first()
    ).toBeVisible();
  });

  test("admin sees the Employees screen", async ({ page }) => {
    await login(page, "admin");

    await page.goto("/employees");
    await expect(pageTitle(page, "Employees")).toBeVisible();
    await expect(page.getByRole("main").getByText("admin1", { exact: true }).first()).toBeVisible();
  });

  test("a manager sees an admin-only notice on Employees", async ({ page }) => {
    await login(page, "manager");

    await page.goto("/employees");
    await expect(page.getByText("This screen is limited to Admin accounts.")).toBeVisible();
  });
});
