/**
 * The raid web page on the serve-only site (VITE_SERVE_ONLY=true) — the public deployment a raid's [Web view]
 * button opens. Runs on its own serve-only dev server (playwright.serve-only.config.ts); no backend — the raid is
 * the route fixture in `fixtures/raidPage.ts`.
 *
 * Run: npm run test:e2e:serve-only -- serve-only-raid
 */
import { expect, test } from "@playwright/test";
import { RAID_PATH, RAID_TITLE, fulfillJson, raidFixture, routeRaid } from "./fixtures/raidPage";

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("the raid page works on the serve-only site, with no sign-in anywhere", async ({ page }) => {
  const routes = await routeRaid(page, (route) => fulfillJson(route, 200, raidFixture()));
  await page.goto(RAID_PATH);
  await expect(page.getByRole("heading", { level: 1, name: RAID_TITLE })).toBeVisible();
  await expect(page.getByText("40/40 confirmed (2 late) · 2 in queue")).toBeVisible();
  await expect(page.getByRole("link", { name: /sign in/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /sign in/i })).toHaveCount(0);

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect.poll(routes.reads).toBe(2);
  await expect(page.getByRole("heading", { level: 1, name: RAID_TITLE })).toBeVisible();
});
