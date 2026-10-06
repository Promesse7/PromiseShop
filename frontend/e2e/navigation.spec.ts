import { test, expect } from "@playwright/test";
import { fixtureProductId, isPhone, login, mainNav, openMoreSheet, pageTitle, type UserKey } from "./helpers";

/**
 * The app shell: grouped sidebar (desktop), bottom tab bar + More sheet (phone), jump search
 * and deep links. Visibility per role mirrors lib/nav/navModel.ts (which mirrors the backend).
 */

const SIDEBAR_GROUPS: Record<UserKey, string[]> = {
  admin: ["Sell", "Stock", "Buy", "Money", "Admin"],
  manager: ["Sell", "Stock", "Buy", "Money"],
  staff: ["Sell", "Stock", "Buy"],
};

const TABS: Record<UserKey, string[]> = {
  admin: ["Dashboard", "Sales", "Products", "Debts"],
  manager: ["Dashboard", "Sales", "Products", "Debts"],
  staff: ["Checkout", "My sales", "Products", "Stock"],
};

// Admin-strict pages: only admin sees them; a manager's backend calls would 403.
const ADMIN_ONLY = ["Employees", "Expenses", "Settings", "Setup", "Notifications"];

test.describe("Navigation", () => {
  for (const who of ["admin", "manager", "staff"] as const) {
    test(`${who} sees the right navigation for the layout`, async ({ page }, testInfo) => {
      const phone = isPhone(testInfo);
      await login(page, who);
      const nav = mainNav(page, phone);
      await expect(nav).toBeVisible();

      if (phone) {
        // Four shortcuts plus More, in order.
        const links = nav.getByRole("link");
        await expect(links).toHaveText(TABS[who]);
        await expect(nav.getByRole("button", { name: "More" })).toBeVisible();
      } else {
        for (const group of SIDEBAR_GROUPS[who]) {
          // .first(): "Stock" is both a group label and a link inside that group.
          await expect(nav.getByText(group, { exact: true }).first()).toBeVisible();
        }
        if (who !== "admin") {
          await expect(nav.getByText("Admin", { exact: true })).toHaveCount(0);
        }
        for (const label of ADMIN_ONLY) {
          await expect(nav.getByRole("link", { name: label, exact: true })).toHaveCount(who === "admin" ? 1 : 0);
        }
        await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveCount(who === "staff" ? 0 : 1);
        await expect(nav.getByRole("link", { name: "Debts" })).toHaveCount(who === "staff" ? 0 : 1);
      }
    });
  }

  test("jump search opens and jumps to Products", async ({ page }, testInfo) => {
    const phone = isPhone(testInfo);
    await login(page, "admin");
    await expect(pageTitle(page, "Dashboard")).toBeVisible();

    if (phone) {
      await page.getByRole("banner").getByRole("button", { name: "Search", exact: true }).click();
    } else {
      // Ctrl+K from anywhere (focus is not in a text field after landing on the dashboard).
      await page.keyboard.press("Control+KeyK");
    }
    const palette = page.getByRole("dialog", { name: "Jump search" });
    await expect(palette).toBeVisible();

    await palette.getByRole("combobox", { name: "Search or jump to" }).fill("Products");
    await expect(palette.getByRole("option").first()).toContainText("Products");
    await palette.getByRole("combobox", { name: "Search or jump to" }).press("Enter");

    await expect(page).toHaveURL("/products");
    await expect(pageTitle(page, "Products")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Jump search" })).toHaveCount(0);
  });

  test("the More sheet opens on phone and reaches every group", async ({ page }, testInfo) => {
    test.skip(!isPhone(testInfo), "The More sheet is the phone navigation; desktop uses the sidebar.");
    await login(page, "admin");

    const sheet = await openMoreSheet(page);
    for (const group of SIDEBAR_GROUPS.admin) {
      await expect(sheet.getByText(group, { exact: true }).first()).toBeVisible();
    }
    await expect(sheet.getByRole("button", { name: "Sign out" })).toBeVisible();

    await sheet.getByRole("link", { name: "Customers" }).click();
    await expect(page).toHaveURL("/customers");
    await expect(pageTitle(page, "Customers")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
  });

  test("a product detail deep link shows its place in the app", async ({ page }, testInfo) => {
    const phone = isPhone(testInfo);
    await login(page, "admin");
    const productId = await fixtureProductId(page);

    await page.goto(`/products/${productId}`);
    await expect(pageTitle(page, "E2E Test Speaker")).toBeVisible();

    if (phone) {
      // The top bar shows the parent page's name and a back arrow on detail routes.
      const banner = page.getByRole("banner");
      // filter visible: the desktop breadcrumb (display:none on phone) also says "Products".
      await expect(banner.getByText("Products", { exact: true }).filter({ visible: true })).toBeVisible();
      const back = banner.getByRole("button", { name: "Back" });
      await expect(back).toBeVisible();
      await back.click();
      await expect(page).not.toHaveURL(new RegExp(`/products/${productId}$`));
    } else {
      // Desktop: the parent stays active in the sidebar and the top-bar breadcrumb links back.
      await expect(mainNav(page, false).getByRole("link", { name: "Products" })).toHaveAttribute("aria-current", "page");
      const crumbs = page.getByRole("banner").getByRole("navigation", { name: "Breadcrumb" });
      await expect(crumbs.getByText("Stock", { exact: true })).toBeVisible();
      await crumbs.getByRole("link", { name: "Products" }).click();
      await expect(page).toHaveURL("/products");
    }
  });
});
