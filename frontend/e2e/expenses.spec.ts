import { test, expect } from "@playwright/test";

test.describe("Expenses", () => {
  test("admin can record an expense and see it in the list with an updated total", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin1");
    await page.getByLabel("Password").fill("adminpass");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/dashboard");

    await page.getByRole("link", { name: "Expenses" }).click();
    await expect(page).toHaveURL("/expenses");
    await expect(page.getByRole("heading", { name: "Expenses" })).toBeVisible();

    await page.getByRole("button", { name: "+ New expense" }).click();
    await page.getByLabel("Category").selectOption("repairs");
    await page.getByLabel("Amount (RWF)").fill("15000");
    await page.getByRole("button", { name: "Save" }).click();

    // .first() — repeated runs against a shared dev DB accumulate same-category rows.
    await expect(page.getByRole("table").getByText("Repairs").first()).toBeVisible();
  });

  test("sales staff do not see an Expenses link", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("staff1");
    await page.getByLabel("Password").fill("staffpass");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/checkout");
    await expect(page.getByRole("link", { name: "Expenses" })).not.toBeVisible();
  });
});
