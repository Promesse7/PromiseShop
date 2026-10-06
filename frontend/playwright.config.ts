import { defineConfig, devices } from "@playwright/test";

// The screenshot run (e2e/screenshots.spec.ts, tagged @screenshots) only runs on request:
//   SCREENSHOTS=1 npx playwright test --workers=1
// Normal runs skip it.
const screenshots = process.env.SCREENSHOTS === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  // The dev backend talks to a remote Neon database and the Next dev server compiles each
  // route on first hit, so a cold page or mutation can take well over Playwright's 5 s default.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  grep: screenshots ? /@screenshots/ : undefined,
  grepInvert: screenshots ? undefined : /@screenshots/,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  // Every spec runs at both sizes. The app switches layout at 1024px: grouped sidebar on
  // desktop, bottom tab bar + More sheet on phone (and DataTables become cards, filters a sheet).
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "phone",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
});
