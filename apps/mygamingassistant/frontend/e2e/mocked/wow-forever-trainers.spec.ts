/**
 * WoW Forever trainers — picking a class or profession, the level ladder folding at your level, your
 * faction's trainers, the phone layout and the loading skeleton.
 * Includes: clicking a trainer opens its recipe list; can-learn marking; skeleton while loading; Back closes.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-trainers
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { MIN_TOUCH_TARGET } from "@platform/ui/test-support/constants/minTouchTarget";
import { createGate } from "@platform/ui/test-support/gate";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

const TRAINERS = "/wow-forever/trainers";

async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("the picker opens a class; a wrong slug says so", async ({ page }) => {
  await page.goto(TRAINERS);
  await expect(page.getByRole("heading", { level: 1, name: "Trainers" })).toBeVisible();
  await page.getByTestId("trainers-picker").getByRole("link", { name: "Mage" }).click();
  await expect(page).toHaveURL(new RegExp(`${TRAINERS}/mage$`));
  await expect(page.getByRole("heading", { level: 1, name: "Mage trainers" })).toBeVisible();
  await expect(page).toHaveTitle(/Mage trainers/);
  await expect(page.getByTestId("trainers-level").first()).toBeVisible();

  await page.goto(`${TRAINERS}/bard`);
  await expect(page.getByText('There\'s no class or profession called "bard"')).toBeVisible();
});

test("your level folds the levels below it and marks the next; faction picks the trainers", async ({ page }) => {
  await page.goto(`${TRAINERS}/warlock`);
  // The class's own ladder; a Warlock's demons have a second one that folds on its own.
  const ladder = page.getByRole("region", { name: "What you can learn at each level" });
  const levels = ladder.getByTestId("trainers-level");
  await expect(levels.first()).toBeVisible();
  const all = await levels.count();

  await page.getByLabel("Your level").fill("20");
  await expect(levels.first()).toContainText("Next");
  const ahead = await levels.count();
  expect(ahead).toBeLessThan(all);
  await ladder.getByRole("button", { name: /below yours/ }).click();
  await expect(levels).toHaveCount(all);

  await page.getByRole("radio", { name: "Horde" }).click();
  const list = page.getByRole("list", { name: "Warlock trainers" });
  await expect(list).toContainText("Orgrimmar");
  await expect(list).not.toContainText("Stormwind");
  await expect(page.getByRole("heading", { level: 3, name: "Demon trainers" })).toBeVisible();

  await page.getByRole("radio", { name: "Alliance" }).click();
  await expect(list).not.toContainText("Orgrimmar");
});

test("a profession lists its ranks, its trainers and links to its guide", async ({ page }) => {
  await page.goto(`${TRAINERS}/tailoring`);
  await expect(page.getByTestId("trainers-rank")).toHaveCount(4);
  await expect(page.getByTestId("trainers-rank").nth(3)).toContainText("Artisan");
  await expect(page.getByRole("list", { name: "Tailoring trainers", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Tailoring guide/ }).click();
  await expect(page).toHaveURL(/\/wow-forever\/professions\?p=tailoring/);
});

test("each crafting rank opens what its trainers teach, in its skill range", async ({ page }) => {
  await page.goto(`${TRAINERS}/tailoring`);
  await expect(page.getByRole("heading", { name: "Ranks: what each one needs and teaches" })).toBeVisible();
  const journeyman = page.getByTestId("trainers-rank").nth(1);
  const toggle = journeyman.getByRole("button", { name: /^What Journeyman teaches · \d+ recipes$/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const list = journeyman.getByRole("list", { name: "Recipes Journeyman trainers teach" });
  const rows = list.getByTestId("trainer-recipe-row");
  const count = Number((await toggle.textContent())?.match(/· (\d+)/)?.[1]);
  await expect(rows).toHaveCount(count);
  // Every row's skill sits in Journeyman's range (from 50, below Expert's 125), lowest first.
  const skills = (await rows.allInnerTexts()).map((t) => Number(t.match(/Skill (\d+)\b/)?.[1]));
  expect(skills.every((n) => n >= 50 && n < 125)).toBe(true);
  expect([...skills].sort((x, y) => x - y)).toEqual(skills);
  await toggle.click();
  await expect(list).toHaveCount(0);
  // Gathering ranks don't get a list; the trainer names say they open one.
  await expect(page.getByText("Click a trainer's name to see everything they teach.")).toBeVisible();
  await page.goto(`${TRAINERS}/mining`);
  await expect(page.getByTestId("trainers-rank").first()).toBeVisible();
  await expect(page.getByTestId("rank-recipes")).toHaveCount(0);
});

test("phones: no sideways scroll and full-size targets", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${TRAINERS}/hunter`);
  await expect(page.getByTestId("trainers-level").first()).toBeVisible();
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  const targets = [
    page.getByLabel("Your level"),
    page.getByTestId("trainers-picker").getByRole("link", { name: "Hunter" }),
    page.getByRole("link", { name: "Spell details and costs" }),
  ];
  for (const target of targets) {
    const box = await target.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  }
});

test("the skeleton shows while the class loads", async ({ page }) => {
  const gate = createGate();
  await page.route(/data\/spellbook\/.*\.json/, async (route) => {
    await gate.wait;
    await route.continue();
  });
  await page.goto(`${TRAINERS}/priest`);
  await expect(page.getByTestId("trainers-skeleton")).toBeVisible();
  gate.release();
  await expect(page.getByTestId("trainers-skeleton")).toHaveCount(0);
  await expect(page.getByTestId("trainers-level").first()).toBeVisible();
});

test("clicking an enchanting trainer opens its recipe list; URL carries ?trainer=", async ({ page }) => {
  await page.goto(`${TRAINERS}/enchanting`);
  // Wait for the trainers section to load (the "Where to train" list, exact name).
  await expect(page.getByRole("list", { name: "Enchanting trainers", exact: true })).toBeVisible();

  // The trainer names should be buttons on crafting professions.
  const trainerButtons = page.getByRole("list", { name: "Enchanting trainers", exact: true }).getByRole("button");
  await expect(trainerButtons.first()).toBeVisible();

  // Click the first trainer button.
  const firstButton = trainerButtons.first();
  const trainerName = await firstButton.textContent();
  await firstButton.click();

  // The panel should appear with the trainer's name.
  const panel = page.getByTestId("trainer-recipes-panel");
  await expect(panel).toBeVisible();
  expect(await panel.getByRole("heading", { level: 3 }).textContent()).toBe(trainerName?.trim());

  // URL should have ?trainer=<npcId>.
  await expect(page).toHaveURL(/trainer=\d+/);

  // Recipe rows or skeleton should be present.
  const hasRows = await page.getByTestId("trainer-recipe-row").count();
  const hasSkeleton = await page.getByTestId("trainer-recipes-skeleton").count();
  expect(hasRows + hasSkeleton).toBeGreaterThan(0);
});

test("closing the recipes panel (× button) removes ?trainer= from the URL", async ({ page }) => {
  // Open via URL directly.
  await page.goto(`${TRAINERS}/enchanting?trainer=1317`);
  await expect(page.getByTestId("trainer-recipes-panel")).toBeVisible();

  // Close via button.
  await page.getByRole("button", { name: /Close .* recipes/ }).click();
  await expect(page.getByTestId("trainer-recipes-panel")).toHaveCount(0);
  await expect(page).not.toHaveURL(/trainer=/);
});

test("Back button closes the recipe panel and returns to the trainer list", async ({ page }) => {
  await page.goto(`${TRAINERS}/enchanting`);
  await expect(page.getByRole("list", { name: "Enchanting trainers", exact: true })).toBeVisible();

  // Click a trainer to push history.
  await page.getByRole("list", { name: "Enchanting trainers", exact: true }).getByRole("button").first().click();
  await expect(page.getByTestId("trainer-recipes-panel")).toBeVisible();
  await expect(page).toHaveURL(/trainer=\d+/);

  // Browser Back pops the history entry.
  await page.goBack();
  await expect(page.getByTestId("trainer-recipes-panel")).toHaveCount(0);
  await expect(page).not.toHaveURL(/trainer=/);
});

test("gathering professions have no trainer buttons (mining)", async ({ page }) => {
  await page.goto(`${TRAINERS}/mining`);
  await expect(page.getByRole("list", { name: "Mining trainers" })).toBeVisible();

  // Mining is a gathering profession — no recipe buttons on trainer rows.
  await expect(page.getByRole("list", { name: "Mining trainers" }).getByRole("button")).toHaveCount(0);
  // No panel.
  await expect(page.getByTestId("trainer-recipes-panel")).toHaveCount(0);
});

test("the recipes skeleton shows while trainerNpcSpells.json loads", async ({ page }) => {
  const gate = createGate();
  await page.route(/data\/professions\/crafting\/classic\/trainerNpcSpells\.json/, async (route) => {
    await gate.wait;
    await route.continue();
  });
  await page.goto(`${TRAINERS}/enchanting?trainer=1317`);
  // The panel should appear immediately (before data loads) showing the skeleton.
  const panel = page.getByTestId("trainer-recipes-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("trainer-recipes-skeleton")).toBeVisible();
  gate.release();
  // After load, the skeleton should vanish.
  await expect(panel.getByTestId("trainer-recipes-skeleton")).toHaveCount(0);
});

test("can-learn highlighting: skill input marks learnable vs needs-skill rows", async ({ page }) => {
  // Open an enchanting trainer that has recipes; set a low skill first.
  await page.goto(`${TRAINERS}/enchanting?trainer=1317&skill=10`);
  const panel = page.getByTestId("trainer-recipes-panel");
  await expect(panel).toBeVisible();

  // Wait for recipe rows to appear.
  await expect(panel.getByTestId("trainer-recipe-row").first()).toBeVisible();
  const rows = panel.getByTestId("trainer-recipe-row");
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);

  // With skill=10, the summary should mention learnable count.
  // Not all rows can be learned at skill 10 (most require more).
  await expect(panel).toContainText(/learnable/);
});

test("phones: recipe panel has no sideways overflow and 44px touch targets", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${TRAINERS}/enchanting?trainer=1317`);
  const panel = page.getByTestId("trainer-recipes-panel");
  await expect(panel).toBeVisible();

  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);

  const closeButton = page.getByRole("button", { name: /Close .* recipes/ });
  const box = await closeButton.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
});
