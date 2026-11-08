/**
 * WoW Forever dungeon pages — the Quests section: a quest opens to its giver
 * (World Map link with the giver marked, directions), the quests leading up to
 * it, the objectives inside the dungeon and its rewards (item pages); the
 * faction toggle; badges; the phone layout and the loading skeleton.
 *
 * Run: npx playwright test --config e2e/playwright.config.ts wow-forever-dungeon-quests
 */
import { test, expect, type Locator, type Page } from "@playwright/test";

const DEADMINES = "/wow-forever/dungeons/deadmines";
const RAGEFIRE = "/wow-forever/dungeons/ragefire-chasm";
const DEFIAS_BROTHERHOOD = 166;

function quests(page: Page): Locator {
  return page.getByRole("region", { name: "Quests" });
}

function questRow(page: Page, id: number): Locator {
  return quests(page).locator(`[data-testid="dungeon-quest-row"][data-quest-id="${id}"]`);
}

async function noSideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("a quest opens to its giver, the chain before it, objectives inside and rewards", async ({ page }) => {
  await page.goto(DEADMINES);
  const row = questRow(page, DEFIAS_BROTHERHOOD);
  const toggle = row.getByTestId("dungeon-quest-toggle");
  await expect(toggle).toContainText("The Defias Brotherhood");
  await expect(toggle).toContainText("Level 22");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  const details = row.getByTestId("dungeon-quest-details");
  await expect(details.getByTestId("quest-giver")).toContainText("Gryan Stoutmantle");
  await expect(details.getByTestId("quest-giver")).toContainText("Westfall · Sentinel Hill");
  const chain = details.getByTestId("quest-chain").getByRole("listitem");
  expect(await chain.count()).toBeGreaterThan(1);
  await expect(chain.last()).toContainText("this quest");
  const objective = details.getByTestId("quest-objective").filter({ hasText: "Head of VanCleef" });
  await expect(objective.getByTestId("quest-inside-dungeon")).toBeVisible();
  await expect(details.getByText("Choose one of")).toBeVisible();
  await expect(details.getByTestId("quest-reward-row")).toHaveCount(3);

  await details.getByRole("link", { name: "Chausses of Westfall" }).click();
  await expect(page).toHaveURL("/wow-forever/items/6087");
});

test("the giver's World Map link opens its zone with the giver marked", async ({ page }) => {
  await page.goto(DEADMINES);
  const row = questRow(page, DEFIAS_BROTHERHOOD);
  await row.getByTestId("dungeon-quest-toggle").click();
  const directions = row.getByRole("link", { name: "Directions to Gryan Stoutmantle" });
  await expect(directions).toHaveAttribute("href", /^\/wow-forever\/map\?to=.*&dir=1$/);

  await row.getByTestId("quest-giver-map-link").click();
  await expect(page).toHaveURL(/\/wow-forever\/map\?m=1436/);
  const banner = page.getByTestId("shared-view-banner");
  await expect(banner).toContainText("Shared with you: 1 mark on Westfall");
  await expect(banner.getByRole("list", { name: "Shared marks" })).toContainText("Gryan Stoutmantle");
});

test("the faction toggle shows the other side's quests and is remembered", async ({ page }) => {
  await page.goto(DEADMINES);
  await expect(questRow(page, DEFIAS_BROTHERHOOD)).toBeVisible();
  await quests(page).getByRole("radio", { name: "Horde" }).click();
  await expect(quests(page).getByText("No quests for this dungeon for your faction in our data yet.")).toBeVisible();

  await page.goto(RAGEFIRE);
  await expect(quests(page).getByRole("radio", { name: "Horde" })).toHaveAttribute("aria-checked", "true");
  await expect(quests(page).getByTestId("dungeon-quest-row").first()).toBeVisible();
  await quests(page).getByRole("radio", { name: "Alliance" }).click();
  await expect(quests(page).getByTestId("dungeon-quest-row")).toHaveCount(0);
});

test("quest facts carry their badges", async ({ page }) => {
  await page.goto(DEADMINES);
  // The section's "in the Forever game files" note.
  await expect(quests(page).locator('[data-provenance="client"]')).toHaveCount(1);
  const row = questRow(page, DEFIAS_BROTHERHOOD);
  // Seen in the operator's client: the row's title and level.
  await expect(row.locator('[data-provenance="seen"]')).toHaveCount(1);
  await row.getByTestId("dungeon-quest-toggle").click();
  // Given by, chain, hand in to: Classic. Objectives and rewards: seen.
  await expect(row.getByTestId("dungeon-quest-details").locator('[data-provenance="classic"]')).toHaveCount(3);
  await expect(row.getByTestId("dungeon-quest-details").locator('[data-provenance="seen"]')).toHaveCount(2);
  await expect(page.locator('a[href*="wowhead"]')).toHaveCount(0);
});

test.describe("at 375px", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("the Quests section fits the phone with tap-sized rows and links", async ({ page }) => {
    await page.goto(DEADMINES);
    const row = questRow(page, DEFIAS_BROTHERHOOD);
    const toggle = row.getByTestId("dungeon-quest-toggle");
    expect((await toggle.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect((await quests(page).getByRole("radio", { name: "Horde" }).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await toggle.click();
    const mapLink = row.getByTestId("quest-giver-map-link");
    expect((await mapLink.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect((await row.getByTestId("quest-reward-row").first().boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(await noSideways(page)).toBeLessThanOrEqual(0);
  });
});

test("the Quests skeleton shows while the dungeon data loads, then the quests", async ({ page }) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/data\/dungeons\/.*\.json/, async (route) => {
    await held;
    await route.continue();
  });

  await page.goto(DEADMINES);
  const skeleton = page.getByTestId("dungeon-quests-skeleton");
  await expect(skeleton).toBeVisible();
  release();
  await expect(skeleton).toHaveCount(0);
  await expect(questRow(page, DEFIAS_BROTHERHOOD)).toBeVisible();
});
