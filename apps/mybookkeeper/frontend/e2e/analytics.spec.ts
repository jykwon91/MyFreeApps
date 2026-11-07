/**
 * Analytics — utility trends. Runs against a fresh organization seeded with
 * ANALYTICS_SEED, so every total on the page is known in advance.
 */
import { test, expect } from "@playwright/test";
import { holdRequests } from "./fixtures/hold-requests";
import { seededOrg } from "./fixtures/seeded-org";
import { ANALYTICS_SEED as SEED, seedAnalytics } from "./fixtures/analytics-seed";
import {
  TYPE_CARDS,
  cardAmount,
  expectCards,
  expectChart,
  openAnalytics,
  summary,
  trendsChart,
  xAxisLabels,
} from "./fixtures/analytics-page";

const TRENDS_PATH = "/analytics/utility-trends";

const org = seededOrg("analytics", seedAnalytics);

test.describe("Analytics — Layout", () => {
  test.beforeEach(async ({ page }) => {
    await org().signIn(page);
    await openAnalytics(page);
  });

  test("shows the Utility Trends tab as active by default", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Utility Trends" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("link", { name: "Analytics" })).toBeVisible();
  });

  test("clicking the tab records it in the URL", async ({ page }) => {
    await page.getByRole("tab", { name: "Utility Trends" }).click();
    await expect(page).toHaveURL(/tab=utility-trends/);
  });
});

test.describe("Analytics — Utility Trends", () => {
  test.beforeEach(async ({ page }) => {
    await org().signIn(page);
  });

  test("totals the last 12 months of approved utility bills, by type", async ({ page }) => {
    await openAnalytics(page);

    // Exact totals: the bill the day before the range and the maintenance expense are left out.
    await expectCards(page, SEED.totals);
    await expectChart(page, SEED.monthLabels.length, SEED.typesInRange);
    await expect(xAxisLabels(page)).toHaveText(SEED.monthLabels);
    await expect(page.getByRole("radio", { name: "Monthly" })).toHaveAttribute("aria-checked", "true");
    // The default view counts as unfiltered.
    await expect(page.getByRole("button", { name: "Clear all filters" })).toHaveCount(0);
  });

  test("quarterly granularity groups the bills by quarter", async ({ page }) => {
    await openAnalytics(page);
    await expect(xAxisLabels(page)).toHaveText(SEED.monthLabels);

    await page.getByRole("radio", { name: "Quarterly" }).click();

    await expect(page).toHaveURL(/[?&]granularity=quarterly(&|$)/);
    await expect(page.getByRole("radio", { name: "Quarterly" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("radio", { name: "Monthly" })).toHaveAttribute("aria-checked", "false");
    // Quarter labels only come back from a quarterly request.
    await expect(xAxisLabels(page)).toHaveText(SEED.quarterLabels);
    await expectCards(page, SEED.totals);
  });

  test("the property filter narrows the totals, and Clear brings them back", async ({ page }) => {
    await openAnalytics(page);
    await expectCards(page, SEED.totals);

    await page.getByRole("button", { name: "Filter by property" }).click();
    await page.getByRole("menuitemcheckbox", { name: SEED.properties.north }).click();
    await page.keyboard.press("Escape");

    await expect(page).toHaveURL(/[?&]properties=[0-9a-f-]{36}(&|$)/);
    await expectCards(page, SEED.north);
    await expectChart(page, SEED.northPeriods, SEED.northTypesInRange);

    await page.getByRole("button", { name: "Clear all filters" }).click();

    await expect(page).not.toHaveURL(/[?&]properties=/);
    await expectCards(page, SEED.totals);
  });

  test("a range covering one month shows that month and asks for a wider range", async ({ page }) => {
    await openAnalytics(page);
    await expectCards(page, SEED.totals);

    await page.getByLabel("From date").fill(SEED.thisMonth.from);

    await expect(page).toHaveURL(new RegExp(`[?&]from=${SEED.thisMonth.from}(&|$)`));
    await expect(cardAmount(page, "Total Utilities")).toHaveText(SEED.thisMonth.total);
    await expect(page.getByText("I only have one month of data — try expanding the date range to see trends.")).toBeVisible();
    await expect(trendsChart(page)).toHaveCount(0);
  });

  test("on a phone the filters open from the Filters button", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAnalytics(page);
    await expectCards(page, SEED.totals);

    const fromDate = page.getByLabel("From date");
    await expect(fromDate).toBeHidden();

    const toggle = page.getByRole("button", { name: "Filters", exact: true });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await fromDate.fill(SEED.thisMonth.from);
    await expect(page).toHaveURL(new RegExp(`[?&]from=${SEED.thisMonth.from}(&|$)`));
    await expect(cardAmount(page, "Total Utilities")).toHaveText(SEED.thisMonth.total);

    // A range with no bills keeps the panel open so the next date can be picked.
    await fromDate.fill("2000-01-01");
    await page.getByLabel("To date").fill("2000-12-31");
    await expect(page.getByText("No utility expenses found between Jan 1, 2000 and Dec 31, 2000.")).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(fromDate).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(fromDate).toBeHidden();
  });

  test("on a larger screen the filters always show, without a Filters button", async ({ page }) => {
    await openAnalytics(page);
    await expectCards(page, SEED.totals);

    await expect(page.getByLabel("From date")).toBeVisible();
    await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeHidden();
  });

  test("a range ending on a bill's date counts that bill", async ({ page }) => {
    await openAnalytics(page, `?from=${SEED.beforeRange.from}&to=${SEED.beforeRange.to}`);

    await expect(cardAmount(page, "Total Utilities")).toHaveText(SEED.beforeRange.total);
    await expect(cardAmount(page, "Water")).toHaveText(SEED.beforeRange.total);
  });

  test("a range with no bills says so, and Reset date range restores the default", async ({ page }) => {
    await openAnalytics(page, "?from=2000-01-01&to=2000-12-31");

    await expect(page.getByText("No utility expenses found between Jan 1, 2000 and Dec 31, 2000.")).toBeVisible();
    await expect(summary(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Reset date range" }).click();

    await expect(page).not.toHaveURL(/[?&](from|to)=/);
    await expectCards(page, SEED.totals);
  });

  test("the skeleton holds the summary card slots while the trends load", async ({ page }) => {
    const release = await holdRequests(page, (url) => url.pathname.endsWith(TRENDS_PATH));
    await page.goto("/analytics");

    // The total plus one slot per utility type. Other gets a card only when
    // there are untyped bills, so it has no slot.
    await expect(page.getByTestId("analytics-skeleton-summary").locator(":scope > *")).toHaveCount(1 + TYPE_CARDS.length);
    await expect(page.getByTestId("analytics-skeleton-filters")).toBeVisible();

    release();

    await expect(page.getByTestId("analytics-skeleton")).toHaveCount(0);
    await expect(summary(page).locator(":scope > *")).toHaveCount(1 + TYPE_CARDS.length + 1);
    await expectCards(page, SEED.totals);
  });

  test("a failed load offers Retry, which loads the totals", async ({ page }) => {
    let failNext = true;
    await page.route((url) => url.pathname.endsWith(TRENDS_PATH), async (route) => {
      if (!failNext) return route.continue();
      failNext = false;
      await route.fulfill({ status: 500, json: { detail: "boom" } });
    });

    await openAnalytics(page);
    await expect(page.getByText("I ran into a problem loading your utility data. Want me to try again?")).toBeVisible();

    await page.getByRole("button", { name: "Retry" }).click();

    await expectCards(page, SEED.totals);
  });
});

test.describe("Analytics — no utility bills", () => {
  const empty = seededOrg("analytics-empty");

  test("an organization with no utility bills sees the empty state", async ({ page }) => {
    await empty().signIn(page);
    await openAnalytics(page);

    await expect(page.getByText(/I haven't found any utility expenses yet/)).toBeVisible();
    await expect(summary(page)).toHaveCount(0);
  });
});

test.describe("Analytics — API", () => {
  test("returns the seeded totals for an explicit range", async () => {
    const { from, to, totalSpend, summary: byType } = SEED.thisMonth;
    const res = await org().api.get(`${TRENDS_PATH}?start_date=${from}&end_date=${to}`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.total_spend).toBe(totalSpend);
    expect(data.summary).toEqual(byType);
  });

  test("rejects an unknown granularity", async () => {
    const res = await org().api.get(`${TRENDS_PATH}?granularity=weekly`);
    expect(res.status()).toBe(422);
  });

  test("rejects a property id that isn't a UUID", async () => {
    const res = await org().api.get(`${TRENDS_PATH}?property_ids=not-a-uuid`);
    expect(res.status()).toBe(422);
  });
});
