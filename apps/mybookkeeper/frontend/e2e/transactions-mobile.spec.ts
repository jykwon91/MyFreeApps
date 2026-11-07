/**
 * Transactions on a phone-sized screen: cards instead of the table, and the
 * collapsible filters. Runs against a fresh organization seeded with
 * DASHBOARD_SEED, so the list always holds the same seven transactions.
 */
import { test, expect, type Page } from "@playwright/test";
import { seededOrg } from "./fixtures/seeded-org";
import { PHONE_VIEWPORT as PHONE } from "./fixtures/phone-viewport";
import { expectBottomSheet, expectNoSidewaysScroll, expectWithinWidth } from "./fixtures/screen-fit";
import { DASHBOARD_SEED as SEED, seedDashboard } from "./fixtures/dashboard-seed";

const EXPENSE_VENDORS = SEED.transactions.filter((t) => t.type === "expense").map((t) => t.vendor);
const ALL_COUNT = SEED.transactions.length;

test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

const org = seededOrg("transactions-mobile", seedDashboard);

function cards(page: Page) {
  return page.getByTestId("transaction-cards").getByRole("button");
}

function filtersToggle(page: Page) {
  return page.getByRole("button", { name: /^Filters/ });
}

test.describe("Transactions on a phone", () => {
  test.beforeEach(async ({ page }) => {
    await org().signIn(page);
    await page.goto("/transactions");
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
  });

  test("lists each transaction as a card instead of the table", async ({ page }) => {
    await expect(cards(page)).toHaveCount(ALL_COUNT);
    await expect(page.getByRole("table")).toBeHidden();
    await expect(cards(page).filter({ hasText: "E2E Tenant Feb" })).toContainText("+$1,800.00");
    const powerBill = cards(page).filter({ hasText: "E2E Power Feb" });
    await expect(powerBill).toContainText("$600.00");
    // Only income gets a plus sign.
    await expect(powerBill).not.toContainText("+");
    // Each card, not just the list: the list clips anything wider than itself.
    for (const card of await cards(page).all()) await expectWithinWidth(card, PHONE.width);
    await expectNoSidewaysScroll(page, PHONE.width);
  });

  test("tapping a card opens that transaction in a bottom sheet", async ({ page }) => {
    await cards(page).filter({ hasText: "E2E Power Feb" }).tap();

    const sheet = page.getByRole("dialog", { name: "E2E Power Feb", exact: true });
    await expect(sheet).toBeVisible();
    await expectBottomSheet(sheet, PHONE);

    await sheet.getByLabel("Close panel").tap();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("the filters stay collapsed until tapped, and filter the cards", async ({ page }) => {
    const type = page.getByRole("combobox", { name: "Filter by type", exact: true });
    await expect(cards(page)).toHaveCount(ALL_COUNT);
    await expect(filtersToggle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(type).toBeHidden();

    await filtersToggle(page).tap();
    await expect(filtersToggle(page)).toHaveAttribute("aria-expanded", "true");
    await type.selectOption("expense");

    await expect(cards(page)).toHaveCount(EXPENSE_VENDORS.length);
    for (const vendor of EXPENSE_VENDORS) await expect(cards(page).filter({ hasText: vendor })).toHaveCount(1);
    // The toggle counts the active filter, and closing the panel keeps it.
    await expect(filtersToggle(page)).toHaveText(/^Filters\s*1$/);
    await filtersToggle(page).tap();
    await expect(type).toBeHidden();
    await expect(cards(page)).toHaveCount(EXPENSE_VENDORS.length);

    await filtersToggle(page).tap();
    await page.getByRole("button", { name: "Clear filters" }).tap();

    await expect(cards(page)).toHaveCount(ALL_COUNT);
    await expect(filtersToggle(page)).toHaveText(/^Filters$/);
  });
});
