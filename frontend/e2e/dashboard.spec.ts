import { test, expect } from "@playwright/test";
import { login, pageTitle } from "./helpers";

/**
 * Requires the admin fixture (admin1/adminpass) and the manager fixture (manager1/managerpass).
 * At least one completed sale and one purchase make the stat cards non-empty, but the cards
 * render either way.
 */
test.describe("Dashboard", () => {
  test("admin sees the monthly stat cards and the CSV export", async ({ page }) => {
    await login(page, "admin");
    await expect(pageTitle(page, "Dashboard")).toBeVisible();

    await expect(page.getByRole("tablist", { name: "Dashboard views" })).toBeVisible();
    await expect(page.getByText("Sales revenue", { exact: true })).toBeVisible();
    await expect(page.getByText("Purchase cost", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Gross profit", { exact: true })).toBeVisible();
    await expect(page.getByText("Needs reorder", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
  });

  test("a manager can open the dashboard too (Phase 0.7)", async ({ page }) => {
    await login(page, "manager");
    await expect(pageTitle(page, "Dashboard")).toBeVisible();
    await expect(page.getByText("Sales revenue", { exact: true })).toBeVisible();
  });
});
