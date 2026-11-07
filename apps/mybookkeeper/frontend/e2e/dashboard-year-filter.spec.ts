/**
 * Dashboard year filter — the dropdown's years, how a year scopes the totals,
 * and where the choice is kept. Runs against a fresh organization seeded with
 * DASHBOARD_SEED (this year) and PRIOR_YEARS_SEED (the two years before).
 */
import { test, expect, type Page } from "@playwright/test";
import { holdRequests } from "./fixtures/hold-requests";
import { SoloOrg } from "./fixtures/solo-org";
import { DASHBOARD_SEED as SEED, seedDashboard } from "./fixtures/dashboard-seed";
import { PRIOR_YEARS_SEED as PRIOR, seedPriorYears } from "./fixtures/dashboard-prior-years-seed";
import { chartIn, dragAcrossMonths, expectSummaryCards, openDashboard } from "./fixtures/dashboard-page";

const STORAGE_KEY = "mbk:selectedYear";

let solo: SoloOrg | undefined;

test.beforeAll(async ({ playwright }) => {
  solo = await SoloOrg.create(playwright, "dashboard-year");
  await seedPriorYears(solo.api, await seedDashboard(solo.api));
});

test.afterAll(async ({ playwright }) => {
  await solo?.delete(playwright);
});

function yearFilter(page: Page) {
  return page.getByTestId("year-filter");
}

test.describe("Dashboard year filter", () => {
  test.beforeEach(async ({ page }) => {
    if (!solo) throw new Error("the dashboard organization was not created");
    await solo.signIn(page);
  });

  test("defaults to this year and lists every year with data, newest first", async ({ page }) => {
    await openDashboard(page);

    await expect(yearFilter(page)).toHaveValue(String(SEED.year));
    await expect(yearFilter(page).locator("option")).toHaveText([
      "All time",
      String(SEED.year),
      String(PRIOR.lastYear),
      String(PRIOR.twoYearsAgo),
    ]);
    await expectSummaryCards(page, SEED.totals);
  });

  test("choosing a past year shows that year's totals and keeps the other years listed", async ({ page }) => {
    await openDashboard(page);
    const options = yearFilter(page).locator("option");
    const everyYear = ["All time", String(SEED.year), String(PRIOR.lastYear), String(PRIOR.twoYearsAgo)];

    await yearFilter(page).selectOption(String(PRIOR.lastYear));

    await expectSummaryCards(page, PRIOR.lastYearTotals);
    await expect(page).toHaveURL(new RegExp(`[?&]year=${PRIOR.lastYear}(&|$)`));
    // Regression: the list once came from the year-scoped summary, so picking
    // a year hid the others. Keep this after the totals check: only once the
    // year's summary has rendered can the list have been rebuilt from it.
    await expect(options).toHaveText(everyYear);
  });

  test("All time adds every year together", async ({ page }) => {
    await openDashboard(page);

    await yearFilter(page).selectOption("all");

    await expectSummaryCards(page, PRIOR.allTimeTotals);
  });

  test("the chosen year is restored from storage on the next visit", async ({ page }) => {
    await openDashboard(page);
    await yearFilter(page).selectOption(String(PRIOR.lastYear));
    await expectSummaryCards(page, PRIOR.lastYearTotals);
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(String(PRIOR.lastYear));

    // A plain "/" (not reload(), which keeps ?year=) so the year must come from storage.
    await page.goto("/");
    await expect(yearFilter(page)).toHaveValue(String(PRIOR.lastYear));
    await expectSummaryCards(page, PRIOR.lastYearTotals);
  });

  test("?year= in the URL wins over the stored year", async ({ page }) => {
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, String(PRIOR.lastYear)]);

    await page.goto("/?year=all");

    await expect(yearFilter(page)).toHaveValue("all");
    await expectSummaryCards(page, PRIOR.allTimeTotals);
  });

  test("choosing a year clears a range dragged on the chart", async ({ page }) => {
    await openDashboard(page);
    await dragAcrossMonths(page, chartIn(page, "Monthly Overview"), "Jan", "Feb");
    await expectSummaryCards(page, SEED.janFeb);
    const reset = page.getByRole("button", { name: /reset to all time/i });
    await expect(reset).toBeVisible();

    await yearFilter(page).selectOption(String(PRIOR.lastYear));

    await expect(reset).toHaveCount(0);
    await expectSummaryCards(page, PRIOR.lastYearTotals);
  });

  test("the skeleton's filter bar has the loaded bar's year filter and presets", async ({ page }) => {
    const releaseSummary = await holdRequests(page, (url) => url.pathname === "/api/summary");

    await page.goto("/");

    const skeletonBar = page.getByTestId("dashboard-skeleton-filter-bar");
    await expect(skeletonBar).toBeVisible({ timeout: 10000 });
    await expect(skeletonBar.getByTestId("dashboard-skeleton-year-filter")).toBeVisible();
    const presetSlots = await page.getByTestId("dashboard-skeleton-presets").locator(":scope > *").count();

    releaseSummary();

    await expect(page.getByTestId("dashboard-skeleton")).toHaveCount(0, { timeout: 15000 });
    const bar = page.getByTestId("dashboard-filter-bar");
    await expect(bar.getByTestId("year-filter")).toBeVisible();
    await expect(bar.locator('[data-testid^="filter-preset-"]')).toHaveCount(presetSlots);
  });
});
