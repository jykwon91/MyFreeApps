/**
 * WoW Forever spellbook — picking a class, the tab / "different from Classic" / search filters and their
 * counts in the URL, a `#spell-<id>` deep link, the links out, the phone layout and the loading skeleton.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-spellbook
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

const SPELLBOOK = "/wow-forever/spellbook";
const WARLOCK = `${SPELLBOOK}/warlock`;
const DESTRUCTION_TAB = 593;
const SHADOW_BOLT = 686;
const MIN_TARGET_PX = 44;

async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

function card(page: Page, name: string) {
  return page.getByTestId("spell-card").filter({ has: page.getByRole("heading", { level: 3, name, exact: true }) });
}

/** The number in a chip's "(N)" count. */
async function chipCount(page: Page, testId: string): Promise<number> {
  const text = (await page.getByTestId(testId).textContent()) ?? "";
  const match = /(\d+)\D*$/.exec(text);
  if (!match) throw new Error(`no count in ${testId}: ${text}`);
  return Number(match[1]);
}

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("the picker opens a class; a wrong class says so", async ({ page }) => {
  await page.goto(SPELLBOOK);
  await expect(page.getByRole("heading", { level: 1, name: "Spellbook" })).toBeVisible();
  await page.getByTestId("spellbook-class-picker").getByRole("link", { name: "Warlock" }).click();
  await expect(page).toHaveURL(new RegExp(`${WARLOCK}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Warlock spellbook" })).toBeVisible();
  await expect(page).toHaveTitle(/Warlock spellbook/);
  await expect(card(page, "Shadow Bolt")).toBeVisible();
  // Where the data comes from: the game files, and Classic for costs.
  await expect(page.getByTestId("spellbook-note")).toContainText("1.60.1");

  await page.goto(`${SPELLBOOK}/necromancer`);
  await expect(page.getByText('There\'s no class called "necromancer"')).toBeVisible();
});

test("tab and different-from-Classic chips filter, count and live in the URL", async ({ page }) => {
  await page.goto(WARLOCK);
  const cards = page.getByTestId("spell-card");
  const total = await chipCount(page, "spellbook-tab-all");
  await expect(cards).toHaveCount(total);

  const destruction = await chipCount(page, `spellbook-tab-${DESTRUCTION_TAB}`);
  await page.getByTestId(`spellbook-tab-${DESTRUCTION_TAB}`).click();
  await expect(page).toHaveURL(/[?&]tab=593(&|$)/);
  await expect(page.getByTestId(`spellbook-tab-${DESTRUCTION_TAB}`)).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toHaveCount(destruction);
  await expect(page.getByTestId("spellbook-tab-section")).toHaveCount(1);

  const different = await chipCount(page, "spellbook-different-chip");
  await page.getByTestId("spellbook-different-chip").click();
  await expect(page).toHaveURL(/[?&]diff=1(&|$)/);
  await expect(cards).toHaveCount(different);
  for (const tag of await page.getByTestId("spell-different-tag").all()) await expect(tag).toBeVisible();
  await expect(page.getByTestId("spell-different-tag")).toHaveCount(different);

  // A reload keeps the filters.
  await page.reload();
  await expect(cards).toHaveCount(different);

  await page.getByRole("button", { name: "Reset filters" }).first().click();
  await expect(page).toHaveURL(new RegExp(`${WARLOCK}$`));
  await expect(cards).toHaveCount(total);
});

test("search narrows the list; nothing matching offers a reset", async ({ page }) => {
  await page.goto(WARLOCK);
  await page.getByLabel("Search").fill("shadow bolt");
  await expect(page).toHaveURL(/[?&]q=shadow\+bolt(&|$)/);
  await expect(card(page, "Shadow Bolt")).toBeVisible();
  await expect(card(page, "Corruption")).toHaveCount(0);

  await page.getByLabel("Search").fill("zzzz no such spell");
  await expect(page.getByText("No spells match these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).last().click();
  await expect(card(page, "Corruption")).toBeVisible();
});

test("a #spell- link scrolls to the spell with its ranks open; its links go to the other pages", async ({ page }) => {
  await page.goto(`${WARLOCK}#spell-${SHADOW_BOLT}`);
  const bolt = page.locator(`#spell-${SHADOW_BOLT}`);
  await expect(bolt).toBeInViewport();
  await expect(bolt.getByTestId("spell-rank-list")).toBeVisible();
  await expect(bolt.getByTestId("spell-rank").first()).toContainText("Sends a shadowy bolt at the enemy");
  // Costs are Classic data and say so.
  await expect(bolt.getByTestId("spell-rank-cost").first()).toBeVisible();

  await expect(bolt.getByTestId("spell-downrank-link")).toHaveAttribute("href", "/wow-forever/downrank?spell=warlock-shadow-bolt");
  await expect(bolt.getByTestId("spell-change-link")).toHaveAttribute(
    "href",
    "/wow-forever/changes?cat=spells&class=warlock&q=Shadow+Bolt",
  );
  await expect(card(page, "Shadowburn").getByTestId("spell-talent-link")).toHaveAttribute(
    "href",
    "/wow-forever/talents/warlock?talent=135415",
  );

  // Other spells' ranks start closed and open on a tap.
  const corruption = card(page, "Corruption");
  await expect(corruption.getByTestId("spell-rank-list")).toBeHidden();
  await corruption.getByTestId("spell-ranks-toggle").click();
  await expect(corruption.getByTestId("spell-rank-list")).toBeVisible();
});

test("phones: no sideways scroll and full-size targets", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(WARLOCK);
  await expect(card(page, "Shadow Bolt")).toBeVisible();
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  const targets = [
    page.getByLabel("Search"),
    page.getByLabel("Your level"),
    page.getByTestId("spellbook-tab-all"),
    page.getByTestId("spellbook-different-chip"),
    page.getByTestId("spell-ranks-toggle").first(),
    page.getByTestId("spell-downrank-link").first(),
  ];
  for (const target of targets) {
    const box = await target.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  }
  await card(page, "Shadow Bolt").getByTestId("spell-ranks-toggle").click();
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
});

test("the skeleton shows while the class loads", async ({ page }) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/data\/spellbook\/.*\.json/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(WARLOCK);
  const skeleton = page.getByTestId("spellbook-skeleton");
  await expect(skeleton).toBeVisible();
  await expect(skeleton.getByTestId("spellbook-skeleton-row").first()).toBeVisible();
  release();
  await expect(skeleton).toHaveCount(0);
  await expect(card(page, "Shadow Bolt")).toBeVisible();
});
