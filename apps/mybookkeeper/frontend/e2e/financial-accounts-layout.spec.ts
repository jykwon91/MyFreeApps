/**
 * Layout E2E for the Financial Accounts page, in a fresh organization of its own.
 *
 * Verifies:
 *   1. The loading skeleton has the loaded page's shape: three total tiles,
 *      then a "What you have" section of three rows and a "What you owe"
 *      section of two, so nothing shifts when the accounts arrive.
 *   2. The page fits phone, tablet and desktop widths with no sideways scroll.
 *   3. A row's actions meet the 44px touch-target minimum on a phone.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { MIN_TOUCH_TARGET } from "@platform/ui/test-support/constants/minTouchTarget";
import { seededOrg } from "./fixtures/seeded-org";
import { PHONE_VIEWPORT } from "./fixtures/phone-viewport";

/** Matches ``FinancialAccountsSkeleton``: rows per section, assets then liabilities. */
const ASSET_ROWS = 3;
const LIABILITY_ROWS = 2;
const TOTAL_TILES = 3;

const SEED = [
  { name: "E2E Layout Checking", account_type: "checking", current_balance_cents: 250000 },
  { name: "E2E Layout Savings", account_type: "savings", current_balance_cents: 1000000 },
  { name: "E2E Layout Brokerage", account_type: "brokerage", current_balance_cents: 4200000 },
  { name: "E2E Layout Card", account_type: "credit_card", current_balance_cents: 50000 },
  { name: "E2E Layout Car Loan", account_type: "loan", current_balance_cents: 1800000 },
] as const;

async function seedAccounts(api: APIRequestContext): Promise<void> {
  for (const account of SEED) {
    const res = await api.post("/financial-accounts", { data: { ...account, balance_as_of: "2026-11-01" } });
    if (!res.ok()) throw new Error(`seeding ${account.name} failed: ${res.status()} ${await res.text()}`);
  }
}

// Deleting the organization afterwards removes every account seeded here.
const org = seededOrg("financial-accounts-layout", seedAccounts);

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

async function waitForAccounts(page: Page): Promise<void> {
  await expect(page.getByTestId("financial-accounts-totals")).toBeVisible({ timeout: 15000 });
}

test.describe("Financial Accounts layout", () => {
  test.beforeEach(async ({ page }) => {
    await org().signIn(page);
  });

  test("the skeleton has the loaded page's tiles, sections and rows", async ({ page }) => {
    // Hold the list long enough to see the skeleton.
    await page.route("**/api/financial-accounts*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });
    const navigation = page.goto("/financial-accounts");

    const skeleton = page.getByTestId("financial-accounts-skeleton");
    await expect(skeleton).toBeVisible({ timeout: 5000 });
    await expect(skeleton.getByTestId("financial-accounts-skeleton-tile")).toHaveCount(TOTAL_TILES);
    const skeletonSections = skeleton.getByTestId("financial-accounts-skeleton-section");
    await expect(skeletonSections).toHaveCount(2);
    await expect(skeletonSections.nth(0).getByTestId("financial-accounts-skeleton-row")).toHaveCount(ASSET_ROWS);
    await expect(skeletonSections.nth(1).getByTestId("financial-accounts-skeleton-row")).toHaveCount(LIABILITY_ROWS);

    await navigation;
    await waitForAccounts(page);
    await expect(skeleton).toBeHidden();

    const totals = page.getByTestId("financial-accounts-totals");
    await expect(totals.getByTestId(/^financial-accounts-total-/)).toHaveCount(TOTAL_TILES);
    await expect(page.getByTestId("financial-accounts-assets").locator("li")).toHaveCount(ASSET_ROWS);
    await expect(page.getByTestId("financial-accounts-liabilities").locator("li")).toHaveCount(LIABILITY_ROWS);
    await expect(page.getByTestId("financial-accounts-closed")).toHaveCount(0);

    // $2,500 + $10,000 + $42,000 owned, $500 + $18,000 owed.
    await expect(page.getByTestId("financial-accounts-total-assets")).toContainText("$54,500.00");
    await expect(page.getByTestId("financial-accounts-total-liabilities")).toContainText("$18,500.00");
    await expect(page.getByTestId("financial-accounts-total-net")).toContainText("$36,000.00");
  });

  for (const viewport of [PHONE_VIEWPORT, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
    test(`fits ${viewport.width}px wide without scrolling sideways`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/financial-accounts");
      await waitForAccounts(page);
      expect(await hasHorizontalOverflow(page)).toBe(false);
    });
  }

  test("a row's actions are big enough to tap on a phone", async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto("/financial-accounts");
    await waitForAccounts(page);

    const row = page.getByTestId("financial-accounts-assets").locator("li").first();
    for (const action of ["financial-account-update-balance", "financial-account-edit"]) {
      const box = await row.getByTestId(action).boundingBox();
      expect(box, `${action} should be on screen`).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    }
    const add = await page.getByTestId("add-financial-account-button").boundingBox();
    expect(add!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });
});
