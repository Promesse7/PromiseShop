import { test, expect } from "@playwright/test";
import { closeFilters, filtersScope, isPhone, login, mainNav, openMoreSheet, pageTitle } from "./helpers";

/**
 * Relies on the notification log already holding entries for admin1 (any completed sale,
 * e.g. from checkout.spec.ts). An empty log is still a valid outcome for the Failed filter.
 */
test.describe("Notifications", () => {
  test("admin can open the notification log and filter to failed", async ({ page }, testInfo) => {
    const phone = isPhone(testInfo);
    await login(page, "admin");

    // Desktop: the sidebar's Admin group. Phone: the More sheet. (Not the top-bar bell, whose
    // accessible name changes with the unread count.)
    if (phone) {
      const sheet = await openMoreSheet(page);
      await sheet.getByRole("link", { name: "Notifications" }).click();
    } else {
      await mainNav(page, false).getByRole("link", { name: "Notifications" }).click();
    }
    await expect(page).toHaveURL("/notifications");
    await expect(pageTitle(page, "Notification log")).toBeVisible();

    const filters = await filtersScope(page, phone);
    await filters.getByRole("radio", { name: "Failed" }).click();
    await expect(filters.getByRole("radio", { name: "Failed" })).toBeChecked();
    await closeFilters(page, phone);

    // With the Failed filter on, no in-app or delivered rows may remain (desktop table or
    // phone cards); an empty log shows the empty state instead, which is also fine.
    await expect(page.getByRole("main").getByText(/^(In app|Delivered)$/)).toHaveCount(0);
  });

  test("sales staff do not see a Notifications link", async ({ page }, testInfo) => {
    const phone = isPhone(testInfo);
    await login(page, "staff");
    await expect(page.getByRole("banner").getByRole("link", { name: /^Notifications/ })).toHaveCount(0);
    if (phone) {
      const sheet = await openMoreSheet(page);
      await expect(sheet.getByRole("link", { name: "Notifications" })).toHaveCount(0);
    } else {
      await expect(mainNav(page, false).getByRole("link", { name: "Notifications" })).toHaveCount(0);
    }
  });
});
