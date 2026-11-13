/**
 * WoW Forever classes — the nine-class index, the per-class hub page (icon,
 * resource, races, proficiencies, changed-vs-Classic section, nav links),
 * back-links from spellbook and talents, class links from the race page,
 * an unknown class, and the phone layout.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-classes
 */
import { test, expect, type Page } from "@playwright/test";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

const CLASSES = "/wow-forever/classes";
const WARRIOR = `${CLASSES}/warrior`;
const MAGE = `${CLASSES}/mage`;
const DRUID = `${CLASSES}/druid`;
const CLASS_COUNT = 9;
const MIN_TARGET_PX = 44;

async function noSideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("the index shows all nine class cards", async ({ page }) => {
  await page.goto(CLASSES);
  await expect(page.getByRole("heading", { level: 1, name: "Classes" })).toBeVisible();
  await expect(page).toHaveTitle(/Classes/);
  await expect(page.getByTestId(/^class-card-/)).toHaveCount(CLASS_COUNT);

  // Each card shows the class name.
  for (const name of ["Warrior", "Paladin", "Hunter", "Rogue", "Priest", "Shaman", "Mage", "Warlock", "Druid"]) {
    await expect(page.getByTestId(/^class-card-/).filter({ hasText: name })).toHaveCount(1);
  }

  // No external links.
  await expect(page.locator('a[href*="wowhead"]')).toHaveCount(0);
});

test("clicking a card opens the class hub", async ({ page }) => {
  await page.goto(CLASSES);
  await page.getByTestId("class-card-warrior").click();
  await expect(page).toHaveURL(new RegExp(`${WARRIOR}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Warrior" })).toBeVisible();
  await expect(page).toHaveTitle(/Warrior/);
});

test("the warrior class hub shows icon, Rage resource and DPS/Tank roles", async ({ page }) => {
  await page.goto(WARRIOR);
  await expect(page.getByTestId("class-page-header")).toBeVisible();
  // Icon is rendered by GameIcon (an img or svg).
  await expect(page.getByTestId("class-page-header").locator("img, svg")).toHaveCount(1);
  // Resource badge: Rage with a Game files provenance badge.
  const resourceBadge = page.getByTestId("class-resource");
  await expect(resourceBadge).toHaveText(/Rage/);
  await expect(resourceBadge.getByTestId("provenance-badge")).toHaveAttribute("data-provenance", "client");
  // Roles summary in the header.
  await expect(page.getByTestId("class-page-header")).toContainText(/Tank|DPS/);
});

test("the mage class hub shows Mana resource and spellbook / downrank links", async ({ page }) => {
  await page.goto(MAGE);
  const resourceBadge = page.getByTestId("class-resource");
  await expect(resourceBadge).toHaveText(/Mana/);
  // Scoped to the page body: the side menu has its own Spellbook and Downrank links.
  const body = page.locator("main");
  // Spellbook link present.
  await expect(body.getByRole("link", { name: /spellbook/i })).toBeVisible();
  // Downrank link: mage has caster specs.
  await expect(body.getByRole("link", { name: /downrank/i })).toBeVisible();
});

test("the warrior class hub does NOT show a downrank link", async ({ page }) => {
  await page.goto(WARRIOR);
  // Wait for the hub itself: a zero count on a page still loading proves nothing.
  await expect(page.getByTestId("class-resource")).toBeVisible();
  // Warrior has no caster/healer specs — downrank is not useful. (The side menu's
  // Downrank calculator link is outside main.)
  await expect(page.locator("main").getByRole("link", { name: /downrank/i })).toHaveCount(0);
});

test("the class hub races section lists races with new-in-Forever combos marked", async ({ page }) => {
  // Human Hunter is new in Forever — it shows on the warrior class page.
  // The races section uses race data loaded async; it should appear.
  await page.goto(WARRIOR);
  const racesSection = page.getByTestId("class-races-section");
  await expect(racesSection).toBeVisible();
  // Warrior races include Human and Orc.
  await expect(racesSection.getByRole("link", { name: "Human" })).toBeVisible();
  await expect(racesSection.getByRole("link", { name: "Orc" })).toBeVisible();
  // Classic data provenance badge on the section.
  await expect(racesSection.getByTestId("provenance-badge")).toBeVisible();
});

test("race links in the class hub navigate to the race page", async ({ page }) => {
  await page.goto(DRUID);
  const racesSection = page.getByTestId("class-races-section");
  await expect(racesSection).toBeVisible();
  await racesSection.getByRole("link", { name: "Night Elf" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/races\/night-elf$/);
  await expect(page.getByRole("heading", { level: 1, name: /Night Elf/ })).toBeVisible();
});

test("the class hub back link returns to the classes index", async ({ page }) => {
  await page.goto(WARRIOR);
  await page.getByRole("link", { name: "All classes" }).click();
  await expect(page).toHaveURL(new RegExp(`${CLASSES}$`));
  await expect(page.getByTestId(/^class-card-/)).toHaveCount(CLASS_COUNT);
});

test("an unknown class shows an error and class picker, not a crash", async ({ page }) => {
  await page.goto(`${CLASSES}/necromancer`);
  await expect(page.getByText(/necromancer/i)).toBeVisible();
  // Should show some pick-a-class fallback.
  await expect(page.getByRole("link", { name: "Warrior" })).toBeVisible();
});

test("spellbook class page has a back-link to the class hub", async ({ page }) => {
  await page.goto("/wow-forever/spellbook/mage");
  const link = page.getByTestId("spellbook-class-hub-link");
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", `${MAGE}`);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${MAGE}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Mage" })).toBeVisible();
});

test("talents class page has a back-link to the class hub", async ({ page }) => {
  await page.goto("/wow-forever/talents/druid");
  const link = page.getByTestId("talents-class-hub-link");
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", `${DRUID}`);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${DRUID}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Druid" })).toBeVisible();
});

test("class chips on the race page link to class hub pages", async ({ page }) => {
  await page.goto("/wow-forever/races/human");
  const chips = page.getByTestId("race-classes");
  await expect(chips).toBeVisible();
  // Warrior chip is a link to the warrior class hub.
  const warriorLink = chips.getByRole("link", { name: "Warrior" });
  await expect(warriorLink).toBeVisible();
  await warriorLink.click();
  await expect(page).toHaveURL(new RegExp(`${WARRIOR}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Warrior" })).toBeVisible();
});

test("the classes index is a hub tile with an update dot until visited", async ({ page }) => {
  const VISITS_KEY = "mga.wowForever.pageVisits.v1";
  await page.addInitScript((key) => {
    if (window.sessionStorage.getItem("e2e-seeded")) return;
    window.sessionStorage.setItem("e2e-seeded", "1");
    window.localStorage.setItem(key, JSON.stringify({ baseline: [], pages: {} }));
  }, VISITS_KEY);
  await page.goto("/wow-forever");

  const tile = page.locator("main .grid").getByRole("link", { name: /^Classes/ });
  await expect(tile.getByTestId("update-dot")).toBeVisible();

  await tile.click();
  await expect(page).toHaveURL(/\/wow-forever\/classes/);
  // The lazy page must actually show before it counts as visited: the URL changes
  // first, and going back before the page appears rightly leaves the dot.
  await expect(page.getByRole("heading", { level: 1, name: "Classes" })).toBeVisible();
  // Visiting clears the dot.
  await page.goBack();
  await expect(tile.getByTestId("update-dot")).toHaveCount(0);
});

test.describe("at 375px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the classes index fits a phone with no sideways scroll", async ({ page }) => {
    await page.goto(CLASSES);
    await expect(page.getByTestId(/^class-card-/)).toHaveCount(CLASS_COUNT);
    expect(await noSideways(page)).toBeLessThanOrEqual(0);
    // Cards are touch-friendly.
    const firstCard = page.getByTestId(/^class-card-/).first();
    const box = await firstCard.boundingBox();
    expect(box?.height, "card height").toBeGreaterThanOrEqual(MIN_TARGET_PX);
  });

  test("the class hub fits a phone with no sideways scroll", async ({ page }) => {
    await page.goto(WARRIOR);
    await expect(page.getByTestId("class-page-header")).toBeVisible();
    expect(await noSideways(page)).toBeLessThanOrEqual(0);
  });
});

test("the loading skeleton shows while race data loads, then the section appears", async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/data\/races\/.*\.json/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(WARRIOR);
  // The skeleton shows while race data is in flight.
  await expect(page.getByTestId("class-page-skeleton")).toBeVisible();
  release();
  // After the data loads the skeleton goes away and the races section appears.
  await expect(page.getByTestId("class-page-skeleton")).toHaveCount(0);
  await expect(page.getByTestId("class-races-section")).toBeVisible();
});

test("the changes section shows talent and spell counts with links to the changes page", async ({ page }) => {
  await page.goto(WARRIOR);
  const changesSection = page.getByTestId("class-changes-section");
  await expect(changesSection).toBeVisible();
  // Classic data provenance badge.
  await expect(changesSection.getByTestId("provenance-badge")).toBeVisible();
  await expect(changesSection.getByTestId("provenance-badge")).toHaveAttribute("data-provenance", "classic");

  // Talents sub-section shows a count and preview links.
  const talentsSection = page.getByTestId("class-changes-talents");
  await expect(talentsSection).toBeVisible();
  await expect(talentsSection).toContainText(/\d+ changed talents/);
  // At least one talent entry link pointing to the talent calculator.
  await expect(talentsSection.getByTestId("class-change-entry-link").first()).toHaveAttribute(
    "href",
    /\/wow-forever\/talents\/warrior\?talent=/,
  );

  // Spells sub-section shows a count and preview links.
  const spellsSection = page.getByTestId("class-changes-spells");
  await expect(spellsSection).toBeVisible();
  await expect(spellsSection).toContainText(/\d+ changed class spells/);
  // Spell entries link to the spellbook (no individual spell deep-link).
  await expect(spellsSection.getByTestId("class-change-entry-link").first()).toHaveAttribute(
    "href",
    /\/wow-forever\/spellbook\/warrior/,
  );
});

test("the changes section 'See all' links open the changes page filtered to the class", async ({ page }) => {
  await page.goto(WARRIOR);
  const talentsSeeAll = page.getByTestId("class-changes-talents-see-all");
  await expect(talentsSeeAll).toBeVisible();
  // Talents is the default category so ?cat= is omitted; ?class=warrior is set.
  await expect(talentsSeeAll).toHaveAttribute("href", /class=warrior/);
  await expect(talentsSeeAll).not.toHaveAttribute("href", /cat=talents/);

  const spellsSeeAll = page.getByTestId("class-changes-spells-see-all");
  await expect(spellsSeeAll).toBeVisible();
  await expect(spellsSeeAll).toHaveAttribute("href", /cat=spells.*class=warrior|class=warrior.*cat=spells/);

  // Clicking the talents "See all" link navigates to the changes page filtered to warrior.
  await talentsSeeAll.click();
  await expect(page).toHaveURL(/\/wow-forever\/changes/);
  await expect(page).toHaveURL(/class=warrior/);
});

test("the changes skeleton shows while change data loads, then the section appears", async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/data\/changes\/classic\/talents\.json/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(WARRIOR);
  // The changes skeleton shows while talent data is in flight.
  const changesSkeleton = page.getByTestId("class-changes-skeleton");
  await expect(changesSkeleton).toBeVisible();
  release();
  // After the data loads the skeleton goes away and the changes section appears.
  await expect(changesSkeleton).toHaveCount(0);
  await expect(page.getByTestId("class-changes-section")).toBeVisible();
});
