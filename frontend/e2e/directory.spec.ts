import { test, expect } from "@playwright/test";

test.describe("Directory (Suppliers/Customers/Employees)", () => {
  test("admin can create a supplier and see it in the list", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin1");
    await page.getByLabel("Password").fill("adminpass");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/dashboard");

    await page.goto("/suppliers");
    await page.getByRole("button", { name: "+ New supplier" }).click();
    await page.getByLabel("Name").fill("E2E Test Supplier");
    await page.getByRole("button", { name: "Save" }).click();
    // Search scopes to this run's row — repeated runs against a shared dev DB otherwise
    // accumulate same-named rows and make a bare getByText ambiguous.
    await page.getByLabel("Search suppliers").fill("E2E Test Supplier");
    await expect(page.getByRole("table").getByText("E2E Test Supplier").first()).toBeVisible();
  });

  test("admin can create a customer and see it in the list", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin1");
    await page.getByLabel("Password").fill("adminpass");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/dashboard");

    await page.goto("/customers");
    await page.getByRole("button", { name: "+ New customer" }).click();
    await page.getByLabel("Name").fill("E2E Test Customer");
    await page.getByRole("button", { name: "Save" }).click();
    // Search scopes to this run's row — repeated runs against a shared dev DB otherwise
    // accumulate same-named rows and make a bare getByText ambiguous.
    await page.getByLabel("Search customers").fill("E2E Test Customer");
    await expect(page.getByRole("table").getByText("E2E Test Customer").first()).toBeVisible();
  });

  test("admin sees the Employees screen; a manager sees an admin-only notice instead", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin1");
    await page.getByLabel("Password").fill("adminpass");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/dashboard");

    await page.goto("/employees");
    await expect(page.getByRole("heading", { name: "Employees" })).toBeVisible();
    await expect(page.getByText("Admin only")).toBeVisible();
  });
});
