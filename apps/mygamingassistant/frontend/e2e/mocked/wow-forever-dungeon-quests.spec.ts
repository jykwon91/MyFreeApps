/**
 * WoW Forever dungeon pages — the Quests section: a quest opens to its giver
 * (World Map link with the giver marked, directions), the quests leading up to
 * it, the objectives inside the dungeon and its rewards (item pages); whether
 * it can be shared and where it sits in its quest line; the faction toggle;
 * badges; the phone layout and the loading skeleton. A dungeon Forever added
 * lists Blizzard's Game Data API quests instead (no giver, level only when seen).
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-dungeon-quests
 */
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { MIN_TOUCH_TARGET } from "@platform/ui/test-support/constants/minTouchTarget";

const DEADMINES = "/wow-forever/dungeons/deadmines";
const RAGEFIRE = "/wow-forever/dungeons/ragefire-chasm";
const DEFIAS_BROTHERHOOD = 166;
const UNSENT_LETTER = 373;
const DALARAN = "/wow-forever/dungeons/city-of-dalaran";
const WETLANDS_DIG = "/wow-forever/dungeons/excavation-site-wetlands";
const BLACKMAW_HOLD = "/wow-forever/dungeons/blackmaw-hold";
const STARVING_ARCANE = 92457;
const A_GREEN_SAMPLE = 92456;
const THE_GRAVE_KNIGHT = 96986;
const HEARTWOVEN = 95809;
const OPEN_THE_MAW = 95682;
const THE_TWIN_BEARS = 92066;

function quests(page: Page): Locator {
  return page.getByRole("region", { name: "Quests" });
}

function questRow(page: Page, id: number): Locator {
  return quests(page).locator(`[data-testid="dungeon-quest-row"][data-quest-id="${id}"]`);
}

function foreverQuestRow(page: Page, id: number): Locator {
  return quests(page).locator(`[data-testid="forever-quest-row"][data-quest-id="${id}"]`);
}

async function noSideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

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
  // Given by, sharing (the client's flag wasn't read when it was seen), chain, hand in to: Classic.
  // Objectives and rewards: seen.
  await expect(row.getByTestId("dungeon-quest-details").locator('[data-provenance="classic"]')).toHaveCount(4);
  await expect(row.getByTestId("dungeon-quest-details").locator('[data-provenance="seen"]')).toHaveCount(2);
  await expect(page.locator('a[href*="wowhead"]')).toHaveCount(0);
});

test("each quest says whether it can be shared and where it sits in its line", async ({ page }) => {
  await page.goto(DEADMINES);
  const last = questRow(page, DEFIAS_BROTHERHOOD);
  await expect(last.getByTestId("quest-sharing")).toHaveText("Shareable");
  await expect(last.getByTestId("quest-step")).toHaveText("Step 7 of 7");
  await last.getByTestId("dungeon-quest-toggle").click();
  await expect(last.getByTestId("quest-sharing-detail")).toContainText("Share it from your quest log");
  await expect(last.getByRole("heading", { name: /^Quest chain/ })).toBeVisible();

  const first = questRow(page, UNSENT_LETTER);
  await expect(first.getByTestId("quest-sharing")).toHaveText("Can't share");
  await expect(first.getByTestId("quest-step")).toHaveText("Step 1 of 12");
  await first.getByTestId("dungeon-quest-toggle").click();
  const chain = first.getByTestId("quest-chain");
  await expect(chain.getByRole("listitem").first()).toContainText("this quest");
  await expect(chain.getByRole("listitem")).toHaveCount(4);
  await expect(first.getByTestId("quest-chain-more")).toHaveText("then 8 more quests");
});

test("a dungeon Forever added lists Blizzard's Dungeon quests: four a faction in Dalaran, seen level first", async ({ page }) => {
  await page.goto(DALARAN);
  await expect(quests(page)).toContainText("From Blizzard's own game data");
  await expect(quests(page).getByTestId("provenance-badge").first()).toContainText("Official");
  await expect(quests(page)).toContainText("Blizzard's data has no quest levels, givers or objectives.");
  await expect(quests(page).getByTestId("dungeon-quest-row")).toHaveCount(0);

  await quests(page).getByRole("radio", { name: "Alliance" }).click();
  await expect(quests(page).getByTestId("forever-quest-row")).toHaveCount(4);
  const arcane = foreverQuestRow(page, STARVING_ARCANE);
  await expect(arcane).toContainText("Level 33");
  await expect(arcane.getByTestId("forever-quest-seen")).toBeVisible();
  await expect(arcane.getByTestId("forever-quest-badges")).toContainText("Dungeon");
  const sample = foreverQuestRow(page, A_GREEN_SAMPLE);
  await expect(sample).not.toContainText("Level");
  await expect(sample.getByTestId("forever-quest-seen")).toHaveCount(0);

  await quests(page).getByRole("radio", { name: "Horde" }).click();
  await expect(quests(page).getByTestId("forever-quest-row")).toHaveCount(4);
  await expect(foreverQuestRow(page, STARVING_ARCANE)).toHaveCount(0);
  await expect(foreverQuestRow(page, THE_GRAVE_KNIGHT)).toBeVisible();
  await expect(page.locator('a[href*="wowhead"]')).toHaveCount(0);
});

test("a Forever quest opens to its rewards: a choice, a single item, and the standing it needs", async ({ page }) => {
  await page.goto(WETLANDS_DIG);
  await quests(page).getByRole("radio", { name: "Alliance" }).click();
  const heart = foreverQuestRow(page, HEARTWOVEN);
  await heart.getByTestId("forever-quest-toggle").click();
  await expect(heart.getByTestId("forever-quest-toggle")).toHaveAttribute("aria-expanded", "true");
  const details = heart.getByTestId("forever-quest-details");
  await expect(details.getByText("Choose one of")).toBeVisible();
  await expect(details.getByTestId("quest-reward-row")).toHaveCount(2);

  // Blizzard calls its one item a choice; a choice of one is shown as what you get.
  const maw = foreverQuestRow(page, OPEN_THE_MAW);
  await maw.getByTestId("forever-quest-toggle").click();
  await expect(maw.getByTestId("forever-quest-details").getByText("You get")).toBeVisible();
  await maw.getByTestId("quest-reward-row").first().getByRole("link").click();
  await expect(page).toHaveURL("/wow-forever/items/271745");

  await page.goto(BLACKMAW_HOLD);
  const bears = foreverQuestRow(page, THE_TWIN_BEARS);
  await bears.getByTestId("forever-quest-toggle").click();
  await expect(bears.getByTestId("forever-quest-details")).toContainText("Neutral or better with Timbermaw Hold");
});

test.describe("at 375px", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("the Quests section fits the phone with tap-sized rows and links", async ({ page }) => {
    await page.goto(DEADMINES);
    const row = questRow(page, DEFIAS_BROTHERHOOD);
    const toggle = row.getByTestId("dungeon-quest-toggle");
    expect((await toggle.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect((await quests(page).getByRole("radio", { name: "Horde" }).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    await toggle.click();
    const mapLink = row.getByTestId("quest-giver-map-link");
    expect((await mapLink.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect((await row.getByTestId("quest-reward-row").first().boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect(await noSideways(page)).toBeLessThanOrEqual(0);
  });

  test("a Forever dungeon's quests fit the phone with tap-sized rows", async ({ page }) => {
    await page.goto(WETLANDS_DIG);
    const toggle = foreverQuestRow(page, OPEN_THE_MAW).getByTestId("forever-quest-toggle");
    expect((await toggle.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    await toggle.click();
    const reward = foreverQuestRow(page, OPEN_THE_MAW).getByTestId("quest-reward-row").first();
    expect((await reward.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
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
