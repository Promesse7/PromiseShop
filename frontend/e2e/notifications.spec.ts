import { test, expect } from "@playwright/test";

/**
 * Requires the fixture product Phase 2's checkout.spec.ts documents (barcode PES-E2E-00001) and a
 * completed sale against it (this test itself doesn't create one — it relies on the notification log
 * already containing at least one "sale_alert" entry for the admin1 fixture user, e.g. from running
 * checkout.spec.ts first, or any completed sale in the dev database). See
 * frontend/e2e/checkout.spec.ts's doc comment for the fixture-product creation command.
 */
test.describe("Notifications", () => {
  test("admin can open the notification log and filter to failed", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin1");
    await page.getByLabel("Password").fill("adminpass");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/dashboard");

    await page.getByRole("link", { name: "Notifications" }).click();
    await expect(page).toHaveURL("/notifications");
    await expect(page.getByRole("heading", { name: "Notification log" })).toBeVisible();

    await page.getByRole("radio", { name: "Failed" }).click();
    const table = page.getByRole("table");
    // If the dev database has no failed notifications, the table shows its empty-state row
    // instead of data rows — that's a valid outcome for this filter, not a failure.
    const emptyState = table.getByText("No notifications yet");
    if (await emptyState.isVisible()) {
      return;
    }
    const rows = table.getByRole("row");
    const bodyRowCount = (await rows.count()) - 1;
    for (let i = 1; i <= bodyRowCount; i++) {
      await expect(rows.nth(i).getByText("Failed")).toBeVisible();
    }
  });

  test("sales staff do not see a Notifications link", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("staff1");
    await page.getByLabel("Password").fill("staffpass");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/checkout");
    await expect(page.getByRole("link", { name: "Notifications" })).not.toBeVisible();
  });
});
