/**
 * WoW Forever downrank calculator — picking a spell, the best-rank highlights moving with level and
 * +healing, copying the suggested macro line, the phone layout and the loading skeleton.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-downrank
 */
import { test, expect, type Page } from "@playwright/test";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

const DOWNRANK = "/wow-forever/downrank";
const MIN_TARGET_PX = 44;

function row(page: Page, rank: number) {
  return page.locator(`[data-testid="downrank-row"][data-rank="${rank}"]`);
}

async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("choose a class and spell; the URL keeps it", async ({ page }) => {
  await page.goto(DOWNRANK);
  await expect(page.getByRole("heading", { level: 1, name: "Downrank calculator" })).toBeVisible();
  await expect(page).toHaveTitle(/Downrank calculator/);

  await page.getByLabel("Class").selectOption("priest");
  await page.getByLabel("Spell", { exact: true }).selectOption("priest-greater-heal");
  await page.getByLabel("Your level").fill("60");
  await expect(page).toHaveURL(/[?&]spell=priest-greater-heal(&|$)/);
  await expect(page).toHaveURL(/[?&]lvl=60(&|$)/);
  await expect(page.getByRole("heading", { name: "Greater Heal ranks" })).toBeVisible();
  await expect(page.getByTestId("downrank-row")).toHaveCount(5);
  await expect(row(page, 1)).toContainText("Learned at 40");
  // The formula note tags the game files and Classic's rules.
  await expect(page.locator('[data-testid="provenance-badge"][data-provenance="client"]').first()).toBeVisible();
  await expect(page.locator('[data-testid="provenance-badge"][data-provenance="classic"]').first()).toBeVisible();
  // Forever changed Greater Heal, so the Changes feed is a click away.
  await expect(page.getByRole("link", { name: "See what Forever changed in Greater Heal" })).toHaveAttribute(
    "href",
    /\/wow-forever\/changes\?cat=spells&class=priest&q=Greater\+Heal/,
  );

  // Switching class picks that class's first spell.
  await page.getByLabel("Class").selectOption("mage");
  await expect(page).toHaveURL(/[?&]spell=mage-frostbolt(&|$)/);
  await expect(page.getByLabel("+Spell damage")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Spell", { exact: true })).toHaveValue("mage-frostbolt");
});

test("more +healing moves the best rank per mana down; a higher level opens new ranks", async ({ page }) => {
  await page.goto(`${DOWNRANK}?spell=priest-greater-heal&lvl=60`);
  await expect(row(page, 5).getByTestId("downrank-best-mana")).toBeVisible();
  await expect(row(page, 5).getByTestId("downrank-best-speed")).toBeVisible();

  await page.getByLabel("+Healing").fill("600");
  await expect(page).toHaveURL(/[?&]bonus=600(&|$)/);
  await expect(row(page, 3).getByTestId("downrank-best-mana")).toBeVisible();
  await expect(row(page, 5).getByTestId("downrank-best-mana")).toHaveCount(0);
  await expect(row(page, 5).getByTestId("downrank-best-speed")).toBeVisible();
  await expect(page.getByTestId("downrank-macro")).toHaveText(["/cast Greater Heal(Rank 3)", "/cast Greater Heal(Rank 5)"]);

  await page.goto(`${DOWNRANK}?spell=priest-heal&lvl=20`);
  await expect(row(page, 1).getByTestId("downrank-best-mana")).toBeVisible();
  await expect(row(page, 2)).toContainText("Learn at 22");
  await page.getByLabel("Your level").fill("30");
  await expect(row(page, 3).getByTestId("downrank-best-mana")).toBeVisible();
  await expect(row(page, 1).getByTestId("downrank-best-mana")).toHaveCount(0);
});

test("Copy puts the suggested macro line on the clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${DOWNRANK}?spell=priest-greater-heal&lvl=60&bonus=600`);
  const copy = page.getByRole("button", { name: "Copy macro: Greater Heal Rank 3" });
  await copy.click();
  await expect(copy).toContainText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("/cast Greater Heal(Rank 3)");
});

test("phones get cards, no sideways scroll and full-size targets", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${DOWNRANK}?spell=priest-greater-heal&lvl=60&bonus=600`);
  const cards = page.getByTestId("downrank-card");
  await expect(cards).toHaveCount(5);
  await expect(page.getByTestId("downrank-row").first()).toBeHidden();
  await expect(cards.filter({ has: page.getByTestId("downrank-best-mana") })).toHaveAttribute("data-rank", "3");
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  for (const control of [page.getByLabel("Class"), page.getByLabel("Spell", { exact: true }), page.getByLabel("Your level"), page.getByLabel("+Healing")]) {
    const box = await control.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  }
  const copyBox = await page.getByRole("button", { name: /^Copy macro:/ }).first().boundingBox();
  expect(copyBox?.height ?? 0).toBeGreaterThanOrEqual(MIN_TARGET_PX);
});

test("the skeleton shows while the spell data loads", async ({ page }) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/data\/downrank\/.*\.json/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(DOWNRANK);
  const skeleton = page.getByTestId("downrank-skeleton");
  await expect(skeleton).toBeVisible();
  await expect(skeleton.getByTestId("downrank-skeleton-row")).toHaveCount(5);
  release();
  await expect(skeleton).toHaveCount(0);
  await expect(page.getByTestId("downrank-suggestions")).toBeVisible();
});
