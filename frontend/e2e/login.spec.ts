import { test, expect } from "@playwright/test";
import { isPhone, login, mainNav, pageTitle } from "./helpers";

test.describe("Login", () => {
  test("staff login redirects to /checkout", async ({ page }, testInfo) => {
    await login(page, "staff");
    await expect(pageTitle(page, "New sale")).toBeVisible();
    await expect(mainNav(page, isPhone(testInfo)).getByRole("link", { name: "Checkout" })).toBeVisible();
  });

  test("admin login redirects to /dashboard", async ({ page }) => {
    await login(page, "admin");
    await expect(pageTitle(page, "Dashboard")).toBeVisible();
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
