/**
 * Dashboard on a phone-sized screen. Runs against a fresh organization seeded
 * with DASHBOARD_SEED, so the cards, charts and drill-down always have data.
 */
import { test, expect } from "@playwright/test";
import { seededOrg } from "./fixtures/seeded-org";
import { PHONE_VIEWPORT as PHONE } from "./fixtures/phone-viewport";
import { expectBottomSheet, expectNoSidewaysScroll, expectWithinWidth } from "./fixtures/screen-fit";
import { DASHBOARD_SEED as SEED, seedDashboard } from "./fixtures/dashboard-seed";
import { bars, chartIn, expectSummaryCards, openDashboard } from "./fixtures/dashboard-page";

test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

const org = seededOrg("dashboard-mobile", seedDashboard);

test.describe("Dashboard on a phone", () => {
  test.beforeEach(async ({ page }) => {
    await org().signIn(page);
    await openDashboard(page);
  });

  test("shows the summary totals without scrolling sideways", async ({ page }) => {
    await expectSummaryCards(page, SEED.totals);
    await expectWithinWidth(page.getByTestId("dashboard-summary-cards"), PHONE.width);
    // Once the charts are drawn, so a chart that lays out wide is counted too.
    await expect(bars(chartIn(page, "Monthly Overview"), "Revenue")).toHaveCount(3);
    await expectNoSidewaysScroll(page, PHONE.width);
  });

  test("the charts fit the screen width", async ({ page }) => {
    for (const title of ["Monthly Overview", "By Category"]) {
      const chart = chartIn(page, title);
      await chart.scrollIntoViewIfNeeded();
      await expect(chart).toBeVisible();
      await expectWithinWidth(chart, PHONE.width);
    }
    // The seeded months are drawn, so the chart isn't just an empty frame.
    await expect(bars(chartIn(page, "Monthly Overview"), "Revenue")).toHaveCount(3);
  });

  test("tapping a bar opens the drill-down as a bottom sheet", async ({ page }) => {
    await bars(chartIn(page, "Monthly Overview"), "Revenue").nth(1).tap();

    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText(`Revenue — February ${SEED.year}`)).toBeVisible();
    await expect(sheet.getByText("1 transaction — $1,800.00")).toBeVisible();
    await expect(sheet.locator("ul li")).toContainText(["E2E Tenant Feb"]);
    // A side panel would start at the top of the screen instead.
    await expectBottomSheet(sheet, PHONE);

    await sheet.getByLabel("Close panel").tap();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
