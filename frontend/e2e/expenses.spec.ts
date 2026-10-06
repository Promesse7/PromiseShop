import { test, expect } from "@playwright/test";
import { dataView, isPhone, login, mainNav, openMoreSheet, pageTitle } from "./helpers";

test.describe("Expenses", () => {
  test("admin can record an expense and see it in the list", async ({ page }, testInfo) => {
    const phone = isPhone(testInfo);
    await login(page, "admin");

    // Expenses lives in the Money group: the sidebar on desktop, the More sheet on phone.
    if (phone) {
      const sheet = await openMoreSheet(page);
      await sheet.getByRole("link", { name: "Expenses" }).click();
    } else {
      await mainNav(page, false).getByRole("link", { name: "Expenses" }).click();
    }
    await expect(page).toHaveURL("/expenses");
    await expect(pageTitle(page, "Expenses")).toBeVisible();

    await page.getByRole("button", { name: "+ New expense" }).click();
    const dialog = page.getByRole("dialog", { name: "New expense" });
    await dialog.getByLabel("Category").selectOption("repairs");
    await dialog.getByLabel("Amount (RWF)").fill("15000");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog", { name: "New expense" })).toHaveCount(0);

    // .first() — repeated runs against a shared dev DB accumulate same-category rows.
    await expect(dataView(page, phone, "Expenses").getByText("Repairs").first()).toBeVisible();
  });

  test("sales staff do not see an Expenses link", async ({ page }, testInfo) => {
    const phone = isPhone(testInfo);
    await login(page, "staff");
    if (phone) {
      const sheet = await openMoreSheet(page);
      await expect(sheet.getByRole("link", { name: "Customers" })).toBeVisible();
      await expect(sheet.getByRole("link", { name: "Expenses" })).toHaveCount(0);
    } else {
      await expect(mainNav(page, false).getByRole("link", { name: "Checkout" })).toBeVisible();
      await expect(mainNav(page, false).getByRole("link", { name: "Expenses" })).toHaveCount(0);
    }
  });
});
