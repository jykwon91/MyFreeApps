/**
 * WoW Forever provenance badges — one tag system on every page, a tap explains a
 * tag, and "How to read these tags" sits at the bottom of each page.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-provenance
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubEmptyPrices } from "./fixtures/emptyPrices";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

const PHONE = { width: 375, height: 812 };

const PAGES = [
  { name: "Professions", path: "/wow-forever/professions?p=tailoring" },
  { name: "Best gear", path: "/wow-forever/gear?class=warlock&lvl=60&view=preraid" },
  { name: "the item page", path: "/wow-forever/items/11815" },
  { name: "Making gold", path: "/wow-forever/gold?band=all" },
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const { name, path } of PAGES) {
  test(`${name} shows provenance badges and the how-to-read note`, async ({ page }) => {
    await stubEmptyPrices(page);
    await page.goto(path);
    await expect(page.getByTestId("provenance-badge").first()).toBeVisible();

    const guide = page.getByTestId("provenance-guide");
    await guide.getByText("How to read these tags").click();
    for (const label of ["Seen in game", "Official", "Game files", "Classic data", "Unconfirmed"]) {
      await expect(guide.getByRole("term").filter({ hasText: label })).toBeVisible();
    }
  });

  test(`${name} has no horizontal overflow at 375px, and a tap explains a badge`, async ({ browser, guardContext }) => {
    const context = await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true });
    await guardContext(context);
    const page = await context.newPage();
    await stubUnmatchedApi(page);
    await stubEmptyPrices(page);
    await page.goto(path);
    const badge = page.getByTestId("provenance-badge").first();
    await expect(badge).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await badge.scrollIntoViewIfNeeded();
    await badge.tap();
    const tooltip = page.getByTestId("provenance-tooltip");
    await expect(tooltip).toBeVisible();
    const box = await tooltip.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
    await expectNoHorizontalOverflow(page);

    await page.getByTestId("provenance-guide").getByText("How to read these tags").tap();
    await expect(tooltip).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
}

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("the item page tags dungeon drops Classic data and explains it on hover", async ({ page }) => {
  await page.goto("/wow-forever/items/11815");
  const dungeon = page.getByRole("region", { name: "How to get it" }).getByRole("region", { name: "Dungeon drop" });
  const badge = dungeon.getByTestId("provenance-badge");
  await expect(badge).toHaveAttribute("data-provenance", "classic");
  await badge.hover();
  await expect(page.getByTestId("provenance-tooltip")).toContainText("True in Classic WoW");
});
