/**
 * WoW Forever dungeon pages — "Before you go": each dungeon quest's line (the
 * quests before it, in order, with giver, zone, coordinates and directions),
 * tick boxes that say where you are in each line and survive a reload, and
 * World Map links marking every quest giver, and the link to the MGA Dungeon
 * Quests addon (the same lines in game) on the Dungeons page.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-dungeon-before-you-go
 */
import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { createGate } from "@platform/ui/test-support/gate";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { QUESTS_DONE_STORAGE_KEY } from "../../src/games/wow-forever/data/dungeons/questProgressConfig";
import { PLAYER_SETTINGS_STORAGE_KEY } from "../../src/games/wow-forever/hooks/usePlayerSettings";

const DEADMINES = "/wow-forever/dungeons/deadmines";
const DEFIAS_BROTHERHOOD = 166;

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

function section(page: Page): Locator {
  return page.getByRole("region", { name: "Before you go" });
}

/** Red Silk Bandanas and The Defias Brotherhood share the same six quests before them: one line. */
function defiasLine(page: Page): Locator {
  return section(page).getByTestId("quest-line").filter({ hasText: "Red Silk Bandanas · The Defias Brotherhood" });
}

function step(line: Locator, n: number): Locator {
  return line.getByTestId("pickup-row").nth(n - 1);
}

test("a line lists the quests before a dungeon quest in order, with who gives them and where", async ({ page }) => {
  await page.goto(DEADMINES);
  const line = defiasLine(page);
  await expect(line.getByTestId("pickup-row")).toHaveCount(8);
  await expect(step(line, 1)).toContainText("Gryan Stoutmantle");
  await expect(step(line, 1)).toContainText("Westfall · Sentinel Hill · 56.3, 47.5");
  await expect(step(line, 2)).toContainText("Wiley the Black");
  await expect(step(line, 2)).toContainText("Redridge Mountains · Lakeshire");
  await expect(step(line, 4)).toContainText("Master Mathias Shaw");
  // Both dungeon quests end the line.
  await expect(step(line, 7)).toContainText("Dungeon quest");
  await expect(line.locator(`[data-testid="pickup-row"][data-quest-id="${DEFIAS_BROTHERHOOD}"]`)).toContainText("Dungeon quest");
  // Each step has directions and links to its quest page.
  await expect(step(line, 2).getByRole("link", { name: "Directions to Wiley the Black" })).toHaveAttribute("href", /\/wow-forever\/map\?to=/);
  await step(line, 2).getByRole("link", { name: "The Defias Brotherhood" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/quests\/\d+/);
});

test("ticking a step ticks the ones before it, says what's next, and survives a reload", async ({ page }) => {
  await page.goto(DEADMINES);
  const line = defiasLine(page);
  await expect(line.getByTestId("quest-line-status")).toContainText("Not started — step 1 of 8");

  await step(line, 4).getByRole("checkbox").check();
  for (const n of [1, 2, 3, 4]) await expect(step(line, n).getByRole("checkbox")).toBeChecked();
  await expect(step(line, 5).getByRole("checkbox")).not.toBeChecked();
  await expect(line.getByTestId("quest-line-status")).toContainText("Next: step 5 of 8");
  await expect(line.getByTestId("quest-line-status")).toContainText("from Gryan Stoutmantle in Westfall");
  await expect(step(line, 5)).toHaveAttribute("aria-current", "step");

  await page.reload();
  await expect(step(defiasLine(page), 4).getByRole("checkbox")).toBeChecked();
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]") as number[], QUESTS_DONE_STORAGE_KEY);
  expect(stored).toHaveLength(4);

  // Unticking a step unticks the ones after it.
  await step(defiasLine(page), 2).getByRole("checkbox").uncheck();
  await expect(step(defiasLine(page), 1).getByRole("checkbox")).toBeChecked();
  for (const n of [2, 3, 4]) await expect(step(defiasLine(page), n).getByRole("checkbox")).not.toBeChecked();

  // The two dungeon quests at the end are side by side: ticking one leaves the other.
  await step(defiasLine(page), 7).getByRole("checkbox").check();
  await expect(step(defiasLine(page), 6).getByRole("checkbox")).toBeChecked();
  await expect(step(defiasLine(page), 8).getByRole("checkbox")).not.toBeChecked();
  await step(defiasLine(page), 8).getByRole("checkbox").check();
  await expect(defiasLine(page).getByTestId("quest-line-status")).toHaveText("All done");

  await section(page).getByRole("button", { name: "Clear my manual ticks for this dungeon" }).click();
  await expect(defiasLine(page).getByRole("checkbox", { checked: true })).toHaveCount(0);
  await expect(section(page).getByRole("button", { name: "Clear my manual ticks for this dungeon" })).toHaveCount(0);
});

test("the World Map link marks every quest giver on the continent", async ({ page }) => {
  await page.goto(DEADMINES);
  const all = section(page).getByTestId("pickup-all-map-link");
  await expect(all).toHaveText("Show all 11 quest givers in Eastern Kingdoms on the World Map");
  await all.click();
  await expect(page).toHaveURL(/\/wow-forever\/map\?m=1415/);
  await expect(page.getByRole("region", { name: "Shared with you" })).toContainText("11 marks on Eastern Kingdoms");
  await expect(page.getByTestId("shared-marks-layer").getByRole("img")).toHaveCount(11);
});

test("on a phone the list fits without sideways scrolling and the tick boxes are big enough to tap", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(DEADMINES);
  const line = defiasLine(page);
  await expect(line).toBeVisible();
  const box = await step(line, 1).locator("label").boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("the skeleton has a Before you go block while the data loads, then the real list replaces it", async ({ page }) => {
  const gate = createGate();
  await page.route(/data\/dungeons\/.*\.json/, async (route) => {
    await gate.wait;
    await route.continue();
  });
  await page.goto(DEADMINES);
  await expect(page.getByTestId("dungeon-before-you-go-skeleton")).toBeVisible();
  gate.release();
  await expect(page.getByTestId("dungeon-before-you-go-skeleton")).toHaveCount(0);
  await expect(defiasLine(page)).toBeVisible();
});

const COMPLETED_QUESTS = /\/api\/wow\/characters\/jason-kwon\/quests\/completed$/;

/** Saves Jason Kwon as the character MGA's pages use (before the page loads). */
async function useCharacter(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify({ faction: "A", classId: "warlock", zoneId: null, level: 20, position: null, characterSlug: "jason-kwon" })],
  );
}

/** The Defias line's quest ids, read from the page (no character saved yet). */
async function defiasIds(page: Page): Promise<number[]> {
  await page.goto(DEADMINES);
  const rows = defiasLine(page).getByTestId("pickup-row");
  await expect(rows).toHaveCount(8);
  return (await rows.evaluateAll((els) => els.map((el) => Number(el.getAttribute("data-quest-id")))));
}

test("without a character the ticks hint stays and a link offers to pick one", async ({ page }) => {
  await page.goto(DEADMINES);
  const line = section(page).getByTestId("battlenet-quests");
  await expect(line).toHaveAttribute("data-state", "none");
  await expect(line).toContainText("Ticks are saved in this browser");
  await expect(line.getByRole("link", { name: "Pick your character to tick the quests you've done automatically" })).toHaveAttribute(
    "href", "/wow-forever/character",
  );
});

test("quests the character completed on Battle.net are ticked, stay ticked, and set where you are", async ({ page }) => {
  const ids = await defiasIds(page);
  await useCharacter(page);
  // Battle.net lists step 5 but not the steps before it.
  await page.route(COMPLETED_QUESTS, (route) => route.fulfill({ json: { quest_ids: [ids[4], 999999] } }));
  await page.reload();
  const line = defiasLine(page);
  await expect(section(page).getByTestId("battlenet-quests")).toContainText(
    "Quests Jason Kwon completed are ticked from Battle.net. It updates after you log out",
  );
  await expect(step(line, 5)).toHaveAttribute("data-source", "battlenet");
  await expect(step(line, 5).getByRole("checkbox")).toBeChecked();
  await expect(step(line, 5).getByRole("checkbox")).toHaveAttribute("aria-disabled", "true");
  await expect(step(line, 5)).toContainText("Battle.net");
  await expect(step(line, 4).getByRole("checkbox")).not.toBeChecked();
  await expect(line.getByTestId("quest-line-status")).toContainText("Next: step 6 of 8");
  await expect(section(page).getByRole("button", { name: "Clear my manual ticks for this dungeon" })).toHaveCount(0);

  // It can't be unticked here.
  // aria-disabled reads as disabled to Playwright, so force the click a person can still make.
  await step(line, 5).getByRole("checkbox").click({ force: true });
  await expect(step(line, 5).getByRole("checkbox")).toBeChecked();

  // A manual tick still works; clearing undoes only it.
  await step(line, 2).getByRole("checkbox").check();
  await expect(step(line, 1).getByRole("checkbox")).toBeChecked();
  await section(page).getByRole("button", { name: "Clear my manual ticks for this dungeon" }).click();
  await expect(step(line, 1).getByRole("checkbox")).not.toBeChecked();
  await expect(step(line, 5).getByRole("checkbox")).toBeChecked();
  await expect(section(page).getByRole("heading", { name: "Before you go" })).toBeFocused();
});

test("a character Battle.net doesn't know, or Battle.net failing, still leaves the ticks working", async ({ page }) => {
  await useCharacter(page);
  let status = 404;
  await page.route(COMPLETED_QUESTS, (route) => route.fulfill({ status, json: { detail: "character_not_found" } }));
  await page.goto(DEADMINES);
  const line = section(page).getByTestId("battlenet-quests");
  await expect(line).toContainText("We can't find Jason Kwon on Battle.net.");
  await expect(line.getByRole("link", { name: "Change character" })).toBeVisible();

  status = 502;
  await page.reload();
  await expect(line).toContainText("Couldn't check Battle.net for quests you've done. You can still tick them yourself.");
  await step(defiasLine(page), 1).getByRole("checkbox").check();
  await expect(step(defiasLine(page), 1).getByRole("checkbox")).toBeChecked();
  status = 200;
  await page.unroute(COMPLETED_QUESTS);
  await page.route(COMPLETED_QUESTS, (route) => route.fulfill({ json: { quest_ids: [] } }));
  await line.getByRole("button", { name: "Try again" }).click();
  await expect(line).toHaveAttribute("data-state", "ready");
});

test("the Battle.net line shows a placeholder while it loads", async ({ page }) => {
  await useCharacter(page);
  const gate = createGate();
  await page.route(COMPLETED_QUESTS, async (route) => {
    await gate.wait;
    await route.fulfill({ json: { quest_ids: [] } });
  });
  await page.goto(DEADMINES);
  const line = section(page).getByTestId("battlenet-quests");
  await expect(line).toHaveAttribute("data-state", "loading");
  gate.release();
  await expect(line).toHaveAttribute("data-state", "ready");
});

test("the addon link opens the Dungeons page with the MGA Dungeon Quests card open, and it downloads", async ({ page }) => {
  await page.goto(DEADMINES);
  await section(page).getByTestId("dungeon-quests-addon-link").click();
  await expect(page).toHaveURL(/\/wow-forever\/dungeons\?addon=open#dungeon-quests-addon$/);
  const card = page.getByTestId("dungeon-quests-addon");
  await expect(card).toHaveAttribute("open", "");
  await expect(card).toContainText(String.raw`World of Warcraft\_forever_\Interface\AddOns`);
  await expect(card.getByTestId("dungeon-quests-addon-download")).toBeInViewport();
  const [download] = await Promise.all([page.waitForEvent("download"), card.getByTestId("dungeon-quests-addon-download").click()]);
  expect(download.suggestedFilename()).toBe("MGADungeonQuests.zip");
  const files = unzipSync(readFileSync(await download.path()));
  expect(Object.keys(files).sort()).toEqual([
    "MGADungeonQuests/",
    "MGADungeonQuests/Data.lua",
    "MGADungeonQuests/MGADungeonQuests.lua",
    "MGADungeonQuests/MGADungeonQuests.toc",
    "MGADungeonQuests/TurnIns.lua",
    "MGAHub/",
    "MGAHub/Bindings.xml",
    "MGAHub/MGAHub.lua",
    "MGAHub/MGAHub.toc",
  ]);
  expect(strFromU8(files["MGADungeonQuests/Data.lua"])).toContain('{id = 166, title = "The Defias Brotherhood"');
  expect(strFromU8(files["MGADungeonQuests/TurnIns.lua"])).toContain('{"Gryan Stoutmantle", 1436,');
  await expect(page.getByText("MGA Dungeon Quests is downloading. Unzip it into your AddOns folder.").first()).toBeVisible();
});

test("on the Dungeons page the addon card stays folded until opened", async ({ page }) => {
  await page.goto("/wow-forever/dungeons");
  const card = page.getByTestId("dungeon-quests-addon");
  await expect(card).not.toHaveAttribute("open", "");
  await card.getByText("See your dungeon quests in game").click();
  await expect(card.getByTestId("dungeon-quests-addon-download")).toBeVisible();
});

test("a line that needs a profession says so; the others don't", async ({ page }) => {
  await page.goto("/wow-forever/dungeons/uldaman");
  const wildLeather = section(page).getByTestId("quest-line").filter({ hasText: "Wild Leather Shoulders" });
  await expect(wildLeather.getByTestId("quest-line-skill")).toHaveText("Needs Leatherworking 225");
  await page.goto(DEADMINES);
  await expect(defiasLine(page).getByTestId("quest-line-skill")).toHaveCount(0);
});
