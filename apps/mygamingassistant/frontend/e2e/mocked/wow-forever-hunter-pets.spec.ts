/**
 * WoW Forever Hunter pets — the family cards, the pet abilities with their ranks and
 * teachers, the tamable beast list (search, family filter, sort, "Show more"), state in
 * the URL, the loading skeleton and the phone layout.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-hunter-pets
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { ALL_BEASTS, PET_FAMILIES, familyBeastCount } from "./fixtures/wowForeverDataCounts";

const PAGE = "/wow-forever/hunter-pets";
/** Beasts shown before "Show more". */
const FIRST_PAGE = 40;

async function noSideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("the page lists the families, the abilities and the beasts a page at a time", async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.getByRole("heading", { level: 1, name: "Hunter pets" })).toBeVisible();
  await expect(page).toHaveTitle(/Hunter pets/);
  await expect(page.getByTestId("family-card")).toHaveCount(PET_FAMILIES);
  await expect(page.getByTestId("ability-card").first()).toBeVisible();
  await expect(page.getByTestId("beast-count")).toHaveText(`${ALL_BEASTS} of ${ALL_BEASTS} beasts`);
  await expect(page.getByTestId("beast-row")).toHaveCount(FIRST_PAGE);
  await page.getByTestId("beasts-show-more").click();
  await expect(page.getByTestId("beast-row")).toHaveCount(FIRST_PAGE * 2);
});

test("searching finds a beast and nothing-found shows the empty state", async ({ page }) => {
  await page.goto(PAGE);
  const search = page.getByLabel("Search");
  await search.fill("forest spider");
  const rows = page.getByTestId("beast-row");
  await expect(rows.first()).toContainText("Forest Spider");
  await expect(rows.first()).toContainText("Elwynn Forest");
  await expect(page).toHaveURL(/q=forest/);
  await search.fill("zzzqqq");
  await expect(page.getByText("No tamable beasts match these filters.")).toBeVisible();
  await expect(rows).toHaveCount(0);
});

test("a family narrows the beasts and the abilities, and is kept in the URL", async ({ page }) => {
  await page.goto(PAGE);
  await page.locator('[data-testid="family-card"][data-family="spider"]').click();
  await expect(page).toHaveURL(/family=spider/);
  await expect(page.getByRole("heading", { name: "Spider abilities" })).toBeVisible();
  const count = page.getByTestId("beast-count");
  const spiders = familyBeastCount("spider");
  expect(spiders).toBeGreaterThan(0);
  expect(spiders).toBeLessThan(ALL_BEASTS);
  await expect(count).toHaveText(`${spiders} of ${ALL_BEASTS} beasts`);
  for (const row of await page.getByTestId("beast-row").all()) await expect(row).toContainText("Spider");
  await page.reload();
  await expect(page.locator('[data-testid="family-card"][data-family="spider"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-testid="family-card"][data-family="spider"]').click();
  await expect(count).toHaveText(`${ALL_BEASTS} of ${ALL_BEASTS} beasts`);
});

test("the family dropdown and the sort change the beast list", async ({ page }) => {
  await page.goto(PAGE + "?sort=speed");
  await expect(page.getByLabel("Sort by")).toHaveValue("speed");
  await page.getByLabel("Family").selectOption("wolf");
  await expect(page).toHaveURL(/family=wolf/);
  await expect(page.getByTestId("beast-row").first()).toContainText("Wolf");
});

test("an ability shows its ranks, learn levels and the beasts that teach them", async ({ page }) => {
  await page.goto(PAGE);
  const bite = page.locator('[data-testid="ability-card"][data-ability="bite"]');
  await bite.locator("summary").click();
  const ranks = bite.getByTestId("ability-rank");
  await expect(ranks.first()).toContainText("Rank 1");
  await expect(ranks.first()).toContainText("learned at pet level");
  await expect(ranks.first().getByRole("list", { name: /Beasts that teach rank 1/ })).toBeVisible();
});

test("every fact carries a provenance badge", async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator("#families").getByTestId("provenance-badge")).toHaveAttribute("data-provenance", "client");
  await expect(page.locator("#abilities").getByTestId("provenance-badge").first()).toHaveAttribute("data-provenance", "client");
  await expect(page.getByTestId("beast-row").first().getByTestId("provenance-badge").first()).toHaveAttribute(
    "data-provenance",
    /classic|seen/,
  );
});

test("a skeleton shows while the data loads, then the page replaces it", async ({ page }) => {
  await page.route("**/hunterPets/hunterPets.json*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.goto(PAGE);
  await expect(page.getByTestId("hunter-pets-skeleton")).toBeVisible();
  await expect(page.getByTestId("family-card").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("hunter-pets-skeleton")).toHaveCount(0);
});

test.describe("at 375px", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("nothing scrolls sideways and the controls are phone sized", async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.getByTestId("family-card").first()).toBeVisible();
    expect(await noSideways(page)).toBeLessThanOrEqual(0);
    for (const card of (await page.getByTestId("family-card").all()).slice(0, 3)) {
      expect((await card.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    expect((await page.getByLabel("Search").boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect((await page.getByTestId("beasts-show-more").boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
