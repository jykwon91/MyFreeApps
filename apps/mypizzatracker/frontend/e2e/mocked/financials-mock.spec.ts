/**
 * No-backend E2E for /financials: today's active drop (or, with none, the
 * newest-dated drop) is picked and its summary and expenses load, a failed
 * load offers a retry, and adding an expense sends it and the totals take it
 * in, and the skeleton has the loaded sections in both loading states. The page picks "today" by the clock, so each test pins it.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { toast } from "@platform/ui/test-support/toast";
import { apiPath } from "@platform/ui/test-support/apiPath";
import { SKELETON_BAR } from "./constants/layoutSelectors";
import { MID_PHONE_VIEWPORT, PHONE_VIEWPORT } from "./constants/phoneViewport";
import { FIXTURE_NOW, ON_DROP_DATE } from "./constants/fixtureTimes";
import { ACTIVE_DROP_ID, PLANNING_DROP_ID } from "./fixtures/dropFixtures";
import { expectBoxesLineUp, measureBoxes } from "@platform/ui/test-support/layoutShift";
import { failReads, holdReads, logReads } from "@platform/ui/test-support/routeControls";
import { expectSameColumns } from "./fixtures/skeletonLayout";
import { stubDropsApi } from "./fixtures/stubDropsApi";
import { stubFinancialsApi } from "./fixtures/stubFinancialsApi";
import { stubSignedInShellAt } from "./fixtures/stubSignedInShellAt";

const DROPS_LIST = apiPath(/^\/drops$/);
const FINANCIALS_READ = apiPath(/^\/financials\/drops\/[^/]+$/);

function summary(page: Page, dropName = "Friday Night Drop") {
  return page.getByRole("main").locator("section").filter({ has: page.getByRole("heading", { name: dropName }) });
}

function expenses(page: Page) {
  return page.getByRole("main").locator("section").filter({ has: page.getByRole("heading", { name: "Expenses" }) });
}

/** The page's header and its summary and expenses sections: the same three boxes loaded or loading. */
function sections(page: Page) {
  return page.getByRole("main").locator("header, section");
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(ON_DROP_DATE);
  await stubSignedInShellAt(page, ON_DROP_DATE);
  await stubDropsApi(page);
});

test("on the active drop's day, shows its totals and expenses over the newer-dated drop, and keeps the choice in the URL", async ({ page }) => {
  await stubFinancialsApi(page);

  await page.goto("/financials");
  await expect(page).toHaveURL(new RegExp(`/financials\\?drop_id=${ACTIVE_DROP_ID}$`));
  await expect(page.getByRole("heading", { name: "Financials", level: 1 })).toBeVisible();
  const picker = page.getByRole("combobox", { name: "Select drop" });
  await expect(picker.getByRole("option")).toHaveText([
    "Holiday Drop — 2026-12-24 (planning)",
    "Friday Night Drop — 2026-11-14 (active)",
    "Opening Night — 2026-10-31 (closed)",
  ]);
  await expect(picker).toHaveValue(ACTIVE_DROP_ID);
  await expect(summary(page).getByText("Healthy", { exact: true })).toBeVisible();
  await expect(summary(page).locator("dl")).toContainText("Pizza count9Revenue$120.00");
  await expect(summary(page).locator("dl")).toContainText("Expenses-$42.00Profit$93.00");
  await expect(expenses(page).getByRole("listitem")).toHaveCount(1);
  await expect(expenses(page).getByRole("listitem")).toContainText("Costco");
});

test("the drop picker spans the header's full width, so a long drop name is never clipped", async ({ page }) => {
  await stubFinancialsApi(page);

  await page.goto("/financials");
  const header = page.getByRole("main").locator("header");
  const picker = page.getByRole("combobox", { name: "Select drop" });
  await expect(picker).toBeVisible();
  const [headerBox, pickerBox] = await Promise.all([header.boundingBox(), picker.boundingBox()]);
  expect(pickerBox!.x, "picker starts at the header's left edge").toBeCloseTo(headerBox!.x, 0);
  expect(pickerBox!.width, "picker is as wide as the header").toBeCloseTo(headerBox!.width, 0);
});

test("with no drop running today, shows the newest-dated drop", async ({ page }) => {
  await page.clock.setFixedTime(FIXTURE_NOW);
  await stubFinancialsApi(page);

  await page.goto("/financials");
  await expect(page).toHaveURL(new RegExp(`/financials\\?drop_id=${PLANNING_DROP_ID}$`));
  await expect(page.getByRole("combobox", { name: "Select drop" })).toHaveValue(PLANNING_DROP_ID);
  await expect(summary(page, "Holiday Drop").locator("dl")).toContainText("Pizza count0Revenue$0.00");
  await expect(expenses(page).getByRole("listitem")).toHaveCount(0);
});

test("adds an expense, which the totals then take in", async ({ page }) => {
  const writes = await stubFinancialsApi(page);

  await page.goto("/financials");
  await expenses(page).getByRole("button", { name: "+ Add expense" }).click();
  await page.getByRole("textbox", { name: "Vendor" }).fill(" Restaurant Depot ");
  await page.getByRole("textbox", { name: "Category" }).fill("supplies");
  await page.getByRole("spinbutton", { name: "Amount" }).fill("18.50");
  await page.getByRole("button", { name: "Add expense", exact: true }).click();

  await expect(toast(page, "Expense added")).toBeVisible();
  await expect(expenses(page).getByRole("listitem")).toHaveCount(2);
  await expect(summary(page).locator("dl")).toContainText("Expenses-$60.50Profit$74.50");
  expect(writes).toEqual([
    {
      method: "POST",
      path: `/financials/drops/${ACTIVE_DROP_ID}/expenses`,
      body: { vendor: "Restaurant Depot", category: "supplies", amount: "18.50", description: null },
    },
  ]);
});

test("a failed load of the totals says so and Retry loads them", async ({ page }) => {
  await stubFinancialsApi(page);
  await failReads(page, FINANCIALS_READ);

  await page.goto("/financials");
  await expect(page.getByText("Failed to load financials.")).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();

  await expect(summary(page)).toBeVisible();
  await expect(page.getByText("Failed to load financials.")).toHaveCount(0);
});

test("a failed load of the drops says so, never claims there are none, and Retry loads the totals", async ({ page }) => {
  await stubFinancialsApi(page);
  await failReads(page, DROPS_LIST);
  const dropReads = await logReads(page, DROPS_LIST);

  await page.goto("/financials");
  await expect(page.getByRole("heading", { name: "Could not load drops" })).toBeVisible();
  await expect(page.getByText("No drops yet")).toHaveCount(0);
  expect(dropReads).toHaveLength(1);

  await page.getByRole("button", { name: "Retry" }).click();

  await expect(summary(page).locator("dl")).toContainText("Pizza count9Revenue$120.00");
  expect(dropReads).toHaveLength(2);
  await expect(page.getByRole("heading", { name: "Could not load drops" })).toHaveCount(0);
  await expect(page.getByText("No drops yet")).toHaveCount(0);
});

/** Both loading states have the loaded page's header and two sections, in their column, with the same gaps and the first section where it ends up. */
async function expectSkeletonsMatchLoadedPage(page: Page): Promise<void> {
  await stubFinancialsApi(page);
  const drops = await holdReads(page, DROPS_LIST);
  const financials = await holdReads(page, FINANCIALS_READ);
  const bars = page.getByRole("main").locator(SKELETON_BAR);

  try {
    await page.goto("/financials");
    await expect(bars).not.toHaveCount(0);
    await expect(sections(page)).toHaveCount(3);
    const whileDropsLoad = await measureBoxes(sections(page));

    drops.release();
    await expect(page.getByRole("combobox", { name: "Select drop" })).toBeVisible();
    await expect(bars).not.toHaveCount(0);
    await expect(sections(page)).toHaveCount(3);
    const whileTotalsLoad = await measureBoxes(sections(page));

    financials.release();
    await expect(bars).toHaveCount(0);
    for (const skeleton of [whileDropsLoad, whileTotalsLoad]) {
      await expectSameColumns(skeleton, sections(page));
      await expectBoxesLineUp(skeleton.slice(1, 2), sections(page).nth(1), ["y"]);
    }
  } finally {
    drops.release();
    financials.release();
  }
}

test("the loading skeletons have the loaded page's three sections, in their column", async ({ page }) => {
  await expectSkeletonsMatchLoadedPage(page);
});

const PHONES = [
  { name: "a small phone", viewport: PHONE_VIEWPORT },
  { name: "a 375px phone", viewport: MID_PHONE_VIEWPORT },
];

for (const { name, viewport } of PHONES) {
  test.describe(`on ${name}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test("the loading skeletons have the loaded page's three sections, in their column", async ({ page }) => {
      await expectSkeletonsMatchLoadedPage(page);
    });
  });
}
