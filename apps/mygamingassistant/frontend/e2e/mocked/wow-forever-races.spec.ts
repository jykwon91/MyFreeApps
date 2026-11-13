/**
 * WoW Forever races — every race with its faction, starting zone, classes and
 * racials (status vs Classic, Classic | Forever side by side when changed),
 * the filters (kept in the URL, chip counts), racial anchors, the per-race
 * page, the phone layout and the loading skeleton.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-races
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { ALL_RACES, ALL_RACIALS, raceListing, racialsWithStatus } from "./fixtures/wowRacesDataCounts";

const RACES = "/wow-forever/races";
const UNCHANGED = racialsWithStatus("unchanged");
const REMOVED = racialsWithStatus("removed");

async function noSideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("the list shows every race with its zone, classes and racials, with statuses and badges", async ({ page }) => {
  await page.goto(RACES);
  await expect(page.getByRole("heading", { level: 1, name: "Races" })).toBeVisible();
  await expect(page).toHaveTitle(/Races/);
  const cards = page.getByTestId("race-card");
  await expect(cards).toHaveCount(ALL_RACES);
  await expect(page.getByTestId("races-count")).toHaveText(`${ALL_RACES} races · ${ALL_RACIALS} racials`);

  const human = page.locator("#human");
  await expect(human.getByTestId("race-faction")).toHaveText("Alliance");
  await expect(human.getByTestId("race-start-zone")).toContainText("Elwynn Forest");
  await expect(human.getByTestId("race-start-zone").getByTestId("provenance-badge")).toHaveAttribute("data-provenance", "classic");
  // Hunter is a combination Classic didn't allow.
  await expect(human.getByTestId("race-classes").locator("li", { hasText: "Hunter" })).toContainText("New in Forever");

  // A changed racial shows Classic next to Forever, and its old name.
  const ruthless = page.locator("#human-ruthless");
  await expect(ruthless.getByTestId("racial-status")).toHaveText("Changed in Forever");
  await expect(ruthless).toContainText("Was: Sword Specialization");
  const compare = ruthless.getByTestId("racial-compare");
  await expect(compare).toContainText("Classic Era");
  await expect(compare).toContainText("Forever");
  await expect(compare.locator('[data-provenance="classic"]')).toHaveCount(1);
  await expect(compare.locator('[data-provenance="client"]')).toHaveCount(1);

  // A new racial is game-files text; a removed one sits collapsed at the bottom.
  await expect(page.locator("#human-will-to-survive").getByTestId("racial-status")).toHaveText("New in Forever");
  await expect(human.getByTestId("removed-racials")).toContainText("Removed in Forever (2): Diplomacy, Mace Specialization");
  await expect(page.locator("#human-diplomacy")).toBeHidden();

  // A value missing from the game files is "?" and explained.
  const berserking = page.locator("#troll-berserking");
  await expect(berserking).toContainText("?");
  await expect(berserking.getByTestId("racial-partial")).toBeVisible();

  // The Skyborne start is unconfirmed, with a World Map link.
  const skyborne = page.locator("#high-order-skyborne");
  await expect(skyborne).toContainText("New race in Forever");
  await expect(skyborne.getByTestId("race-start-zone").getByTestId("provenance-badge")).toHaveAttribute("data-provenance", "unconfirmed");
  await expect(skyborne.getByRole("link", { name: "Show on the World Map" })).toHaveAttribute("href", "/wow-forever/map?m=2521");

  await expect(page.locator('a[href*="wowhead"], a[href*="foreverchanges"]')).toHaveCount(0);
});

test("filter chips show counts, narrow the list, live in the URL and reset", async ({ page }) => {
  await page.goto(RACES);
  const cards = page.getByTestId("race-card");
  await expect(cards).toHaveCount(ALL_RACES);
  await expect(page.getByTestId("race-status-unchanged-count")).toHaveText(String(UNCHANGED));

  const horde = raceListing({ faction: "horde" });
  const hordeUnchanged = raceListing({ faction: "horde", status: "unchanged" });
  expect(horde.races).toBeLessThan(ALL_RACES);
  expect(hordeUnchanged.races).toBeLessThan(horde.races);
  expect(hordeUnchanged.racials).toBeLessThan(horde.racials);
  await page.getByTestId("race-faction-horde").click();
  await expect(page).toHaveURL(/faction=horde/);
  await expect(cards).toHaveCount(horde.races);
  await expect(page.locator("#human")).toHaveCount(0);
  await expect(page.getByTestId("race-faction-horde")).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("race-status-unchanged").click();
  await expect(page).toHaveURL(/status=unchanged/);
  await expect(cards).toHaveCount(hordeUnchanged.races);
  await expect(page.getByTestId("racial-row")).toHaveCount(hordeUnchanged.racials);
  await expect(page.getByTestId("race-faction-alliance-count")).toHaveText(
    String(raceListing({ faction: "alliance", status: "unchanged" }).races),
  );

  // A shared link opens with the same filters.
  await page.reload();
  await expect(page.getByTestId("race-status-unchanged")).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toHaveCount(hordeUnchanged.races);

  await page.getByLabel("Can be a").selectOption("paladin");
  await expect(page).toHaveURL(/class=paladin/);
  await expect(cards).toHaveCount(raceListing({ faction: "horde", status: "unchanged", classId: "paladin" }).races);
  await expect(page.locator("#undead")).toBeVisible();

  await page.getByLabel("Can be a").selectOption("druid");
  await expect(cards).toHaveCount(raceListing({ faction: "horde", status: "unchanged", classId: "druid" }).races);
  await page.getByTestId("race-faction-alliance").click();
  // The empty state below needs this filter set to match nothing.
  expect(raceListing({ faction: "alliance", status: "unchanged", classId: "druid" }).races).toBe(0);
  await expect(cards).toHaveCount(0);
  await expect(page.getByTestId("races-empty")).toBeVisible();
  await page.getByTestId("races-empty").getByRole("button", { name: "Reset filters" }).click();
  await expect(page).toHaveURL(RACES);
  await expect(cards).toHaveCount(ALL_RACES);
});

test("Only changed hides unchanged racials and keeps removed ones", async ({ page }) => {
  await page.goto(RACES);
  await page.getByTestId("race-changed-only").click();
  await expect(page).toHaveURL(/changed=1/);
  const changed = raceListing({ changedOnly: true });
  await expect(page.getByTestId("races-count")).toHaveText(`${changed.races} races · ${changed.racials} racials`);
  await expect(page.locator('[data-testid="racial-status"][data-status="unchanged"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="racial-status"][data-status="removed"]')).toHaveCount(REMOVED);
});

test("racial anchors deep-link and jump, including into the removed section", async ({ page }) => {
  await page.goto(`${RACES}#troll-berserking`);
  const berserking = page.locator("#troll-berserking");
  await expect(berserking).toBeInViewport();

  // The card's racial names jump to the racial.
  await page.goto(RACES);
  await page.locator("#dwarf").getByRole("navigation").getByRole("link", { name: "Stoneform" }).click();
  await expect(page).toHaveURL(/#dwarf-stoneform$/);
  await expect(page.locator("#dwarf-stoneform")).toBeInViewport();

  // A link to a removed racial opens its collapsed section.
  await page.goto(`${RACES}#dwarf-gun-specialization`);
  await expect(page.locator("#dwarf-gun-specialization")).toBeVisible();
  await expect(page.locator("#dwarf-gun-specialization")).toBeInViewport();
});

test("each race has its own page; an unknown race says so", async ({ page }) => {
  await page.goto(RACES);
  await page.locator("#gnome").getByRole("link", { name: "Gnome" }).click();
  await expect(page).toHaveURL(`${RACES}/gnome`);
  await expect(page.getByRole("heading", { level: 1, name: "Races: Gnome" })).toBeVisible();
  await expect(page.getByTestId("race-card")).toHaveCount(1);
  await expect(page.getByTestId("race-filters")).toHaveCount(0);
  await page.getByRole("link", { name: "All races" }).click();
  await expect(page).toHaveURL(RACES);
  await expect(page.getByTestId("race-card")).toHaveCount(ALL_RACES);

  await page.goto(`${RACES}/pandaren`);
  await expect(page.getByTestId("races-unknown")).toBeVisible();
  await expect(page.getByRole("link", { name: "All races" })).toBeVisible();
});

test.describe("at 375px", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("the list fits a phone with 44px controls and no sideways scroll", async ({ page }) => {
    await page.goto(RACES);
    await expect(page.getByTestId("race-card")).toHaveCount(ALL_RACES);
    expect(await noSideways(page)).toBeLessThanOrEqual(0);
    for (const id of ["race-faction-alliance", "race-status-changed", "race-changed-only"]) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box?.height, id).toBeGreaterThanOrEqual(44);
    }
    const select = await page.getByLabel("Can be a").boundingBox();
    expect(select?.height).toBeGreaterThanOrEqual(44);
    const jump = await page.locator("#human").getByRole("navigation").getByRole("link").first().boundingBox();
    expect(jump?.height).toBeGreaterThanOrEqual(44);

    await page.goto(`${RACES}/human`);
    await expect(page.getByTestId("race-card")).toHaveCount(1);
    expect(await noSideways(page)).toBeLessThanOrEqual(0);
  });
});

test("the skeleton mirrors the list while the races load, then the list replaces it", async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/data\/races\/.*\.json/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(RACES);
  const skeleton = page.getByTestId("races-skeleton");
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveAttribute("aria-busy", "true");
  await expect(skeleton.getByTestId("races-skeleton-filters")).toHaveCount(1);
  await expect(skeleton.getByTestId("races-skeleton-card")).toHaveCount(3);
  release();
  await expect(skeleton).toHaveCount(0);
  await expect(page.getByTestId("race-filters")).toHaveCount(1);
  await expect(page.getByTestId("race-card").first()).toBeVisible();
});
