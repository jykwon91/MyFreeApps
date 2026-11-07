/**
 * Dashboard filters — category presets and chips, the property filter, and how
 * they reshape the totals, the monthly chart and the drill-down. Runs against
 * a fresh organization seeded with DASHBOARD_SEED, so every total is exact.
 */
import { test, expect, type Page } from "@playwright/test";
import { SoloOrg } from "./fixtures/solo-org";
import { DASHBOARD_SEED as SEED, seedDashboard } from "./fixtures/dashboard-seed";
import { bars, card, chartIn, expectSummaryCards, legend, openDashboard } from "./fixtures/dashboard-page";

const ONLY_EXPENSES = { revenue: "$0.00", expenses: SEED.totals.expenses, profit: `-${SEED.totals.expenses}` };
const ONLY_INCOME = { revenue: SEED.totals.revenue, expenses: "$0.00", profit: SEED.totals.revenue };
const NORTH = SEED.byProperty.north;

/** The category chips (the Reset button in the same panel has no pressed state). */
function chips(page: Page) {
  return page.getByTestId("filter-categories-panel").locator("button[aria-pressed]");
}

function chip(page: Page, name: string) {
  return page.getByTestId("filter-categories-panel").getByRole("button", { name, exact: true });
}

async function expandChips(page: Page): Promise<void> {
  await page.getByTestId("filter-expand-toggle").click();
  await expect(page.getByTestId("filter-categories-panel")).toBeVisible();
}

async function selectProperty(page: Page, name: string): Promise<void> {
  await page.getByTestId("property-filter-trigger").click();
  await page.getByRole("menuitemcheckbox", { name }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("property-filter-trigger")).toHaveText(name);
}

test.describe("Dashboard filters", () => {
  let solo: SoloOrg | undefined;

  test.beforeAll(async ({ playwright }) => {
    solo = await SoloOrg.create(playwright, "dashboard-filter");
    await seedDashboard(solo.api);
  });

  test.afterAll(async ({ playwright }) => {
    await solo?.delete(playwright);
  });

  test.beforeEach(async ({ page }) => {
    if (!solo) throw new Error("the dashboard organization was not created");
    await solo.signIn(page);
    await openDashboard(page);
    await expect(page.getByTestId("dashboard-filter-bar")).toBeVisible();
  });

  test.describe("Category presets", () => {
    test("Expenses leaves only expenses in the totals and the chart", async ({ page }) => {
      await page.getByTestId("filter-preset-expenses").click();

      await expectSummaryCards(page, ONLY_EXPENSES);
      await expect(page.getByTestId("filter-count")).toBeVisible();
      const chart = chartIn(page, "Monthly Overview");
      await expect(bars(chart, "Revenue")).toHaveCount(0);
      await expect(bars(chart, "maintenance")).toHaveCount(2);
      await expect(bars(chart, "utilities")).toHaveCount(1);
    });

    test("Income leaves only income in the totals and the chart", async ({ page }) => {
      await page.getByTestId("filter-preset-income").click();

      await expectSummaryCards(page, ONLY_INCOME);
      const chart = chartIn(page, "Monthly Overview");
      await expect(bars(chart, "Revenue")).toHaveCount(3);
      await expect(bars(chart, "maintenance")).toHaveCount(0);
      await expect(bars(chart, "utilities")).toHaveCount(0);
    });

    test("All brings every category back", async ({ page }) => {
      await page.getByTestId("filter-preset-expenses").click();
      await expectSummaryCards(page, ONLY_EXPENSES);

      await page.getByTestId("filter-preset-all").click();

      await expectSummaryCards(page, SEED.totals);
      await expect(page.getByTestId("filter-count")).toHaveCount(0);
    });

    test("a category filter leaves the by-property totals whole", async ({ page }) => {
      await page.getByTestId("filter-preset-expenses").click();
      await expectSummaryCards(page, ONLY_EXPENSES);

      const row = card(page, "By Property").locator("tbody tr").filter({ hasText: SEED.properties.north });
      await expect(row.locator("td")).toHaveText([SEED.properties.north, NORTH.revenue, NORTH.expenses, NORTH.profit]);
    });
  });

  test.describe("Category chips", () => {
    test("the chips are grouped under Income and Expenses, all selected", async ({ page }) => {
      await expect(page.getByTestId("filter-categories-panel")).toHaveCount(0);
      await expandChips(page);

      const panel = page.getByTestId("filter-categories-panel");
      await expect(panel.getByText("Income", { exact: true })).toBeVisible();
      await expect(panel.getByText("Expenses", { exact: true })).toBeVisible();
      await expect(chip(page, "Rental Revenue")).toHaveAttribute("aria-pressed", "true");
      await expect(chip(page, "Maintenance")).toHaveAttribute("aria-pressed", "true");
    });

    test("the first click selects only that category; later clicks add and remove", async ({ page }) => {
      await expandChips(page);

      await chip(page, "Rental Revenue").click();
      await expect(chip(page, "Rental Revenue")).toHaveAttribute("aria-pressed", "true");
      await expect(chip(page, "Maintenance")).toHaveAttribute("aria-pressed", "false");
      await expect(page.getByTestId("filter-count")).toHaveText(`1 of ${await chips(page).count()}`);
      await expectSummaryCards(page, ONLY_INCOME);

      await chip(page, "Maintenance").click();
      await expect(chip(page, "Maintenance")).toHaveAttribute("aria-pressed", "true");
      await expectSummaryCards(page, SEED.rentalAndMaintenance);

      await chip(page, "Rental Revenue").click();
      await expect(chip(page, "Rental Revenue")).toHaveAttribute("aria-pressed", "false");
      await expectSummaryCards(page, SEED.onlyMaintenance);
    });

    test("the last selected category can't be turned off", async ({ page }) => {
      await expandChips(page);
      await chip(page, "Maintenance").click();
      await expect(page.getByTestId("filter-count")).toHaveText(`1 of ${await chips(page).count()}`);

      await chip(page, "Maintenance").click();

      await expect(chip(page, "Maintenance")).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("filter-count")).toHaveText(`1 of ${await chips(page).count()}`);
      await expectSummaryCards(page, SEED.onlyMaintenance);
    });
  });

  test.describe("Drill-down under a filter", () => {
    test("with Expenses on, a category bar lists that month's expense", async ({ page }) => {
      await page.getByTestId("filter-preset-expenses").click();
      await bars(chartIn(page, "Monthly Overview"), "utilities").click();

      const panel = page.getByRole("dialog");
      await expect(panel.getByText(`Utilities — February ${SEED.year}`)).toBeVisible();
      await expect(panel.getByText(`1 transaction — ${SEED.byCategory.utilities}`)).toBeVisible();
      await expect(panel.locator("ul li")).toHaveText([/E2E Power Feb/]);
    });

    test("with only Maintenance on, the chart and drill-down hold nothing else", async ({ page }) => {
      await expandChips(page);
      await chip(page, "Maintenance").click();

      const chart = chartIn(page, "Monthly Overview");
      await expect(bars(chart, "Revenue")).toHaveCount(0);
      await expect(bars(chart, "utilities")).toHaveCount(0);
      await expect(bars(chart, "maintenance")).toHaveCount(2);

      await bars(chart, "maintenance").first().click();
      const panel = page.getByRole("dialog");
      await expect(panel.getByText(`Maintenance — January ${SEED.year}`)).toBeVisible();
      await expect(panel.locator("ul li")).toHaveText([/E2E Plumber Jan/, /E2E Handyman Jan/]);
    });
  });

  test.describe("Property filter", () => {
    test("choosing a property narrows the totals to it", async ({ page }) => {
      await expect(page.getByTestId("property-filter-trigger")).toHaveText("All Properties");

      await selectProperty(page, SEED.properties.north);

      await expectSummaryCards(page, NORTH);
    });

    test("with one property chosen, the chart splits its revenue and expenses", async ({ page }) => {
      await selectProperty(page, SEED.properties.north);

      const chart = chartIn(page, "Monthly Overview");
      // Recharts' Legend sorts entries by series name, so Expenses comes before Revenue.
      await expect(legend(chart)).toHaveText([
        `${SEED.properties.north} — Expenses`,
        `${SEED.properties.north} — Revenue`,
        "Net Profit",
      ]);
      await expect(bars(chart, `${SEED.properties.north} — Revenue`)).toHaveCount(2);
    });

    test("a category filter on top of a property shows that property's categories (AND)", async ({ page }) => {
      await selectProperty(page, SEED.properties.north);
      await page.getByTestId("filter-preset-expenses").click();

      await expectSummaryCards(page, { revenue: "$0.00", expenses: NORTH.expenses, profit: `-${NORTH.expenses}` });
      const chart = chartIn(page, "Monthly Overview");
      // Sorted by raw series name: "Net Profit" before "maintenance".
      await expect(legend(chart)).toHaveText(["Net Profit", "Maintenance"]);
    });

    test("a drill-down under a property filter lists only that property's rows", async ({ page }) => {
      await selectProperty(page, SEED.properties.south);
      await page.getByTestId("filter-preset-expenses").click();

      await bars(chartIn(page, "Monthly Overview"), "maintenance").click();

      const panel = page.getByRole("dialog");
      await expect(panel.getByText(`Maintenance — January ${SEED.year}`)).toBeVisible();
      await expect(panel.getByText("1 transaction — $100.00")).toBeVisible();
      await expect(panel.locator("ul li")).toHaveText([/E2E Handyman Jan/]);
    });

    test("Reset clears the property and the category filter together", async ({ page }) => {
      await selectProperty(page, SEED.properties.north);
      await page.getByTestId("filter-preset-expenses").click();
      await expectSummaryCards(page, { revenue: "$0.00", expenses: NORTH.expenses, profit: `-${NORTH.expenses}` });

      await expandChips(page);
      await page.getByTestId("filter-clear").click();

      await expect(page.getByTestId("property-filter-trigger")).toHaveText("All Properties");
      await expect(page.getByTestId("filter-count")).toHaveCount(0);
      await expect(page.getByTestId("filter-clear")).toHaveCount(0);
      await expectSummaryCards(page, SEED.totals);
    });
  });
});

test.describe("Dashboard filters with no data", () => {
  let empty: SoloOrg | undefined;

  test.beforeAll(async ({ playwright }) => {
    empty = await SoloOrg.create(playwright, "dashboard-empty");
  });

  test.afterAll(async ({ playwright }) => {
    await empty?.delete(playwright);
  });

  test("an empty dashboard has no filter bar", async ({ page }) => {
    if (!empty) throw new Error("the empty organization was not created");
    await empty.signIn(page);
    await openDashboard(page);

    await expect(page.getByTestId("dashboard-filter-bar")).toHaveCount(0);
  });
});
