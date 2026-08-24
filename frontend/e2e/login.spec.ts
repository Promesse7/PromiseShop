import { test, expect } from "@playwright/test";

test.describe("Login", () => {
  test("staff login redirects to /checkout", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("staff1");
    await page.getByLabel("Password").fill("staffpass");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/checkout");
    await expect(page.getByRole("link", { name: "Checkout" })).toBeVisible();
  });

  test("admin login redirects to /dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin1");
    await page.getByLabel("Password").fill("adminpass");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByText("Admin", { exact: true })).toBeVisible();
  });

  test("failed login shows an error and does not navigate", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("staff1");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid username or password")).toBeVisible();
    await expect(page).toHaveURL("/login");
  });

  test("visiting a protected route without a session redirects to /login", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page).toHaveURL("/login");
  });
});
