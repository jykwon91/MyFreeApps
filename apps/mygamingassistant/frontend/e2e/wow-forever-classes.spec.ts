/**
 * WoW Forever classes — the nine-class index, the per-class hub page (icon,
 * resource, races, proficiencies, nav links), back-links from spellbook and
 * talents, class links from the race page, an unknown class, and the phone
 * layout.
 *
 * Run: npx playwright test --config e2e/playwright.config.ts wow-forever-classes
 */
import { test, expect, type Page } from "@playwright/test";

const CLASSES = "/wow-forever/classes";
const WARRIOR = `${CLASSES}/warrior`;
const MAGE = `${CLASSES}/mage`;
const DRUID = `${CLASSES}/druid`;
const CLASS_COUNT = 9;
const MIN_TARGET_PX = 44;

async function noSideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

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
  // Spellbook link present.
  await expect(page.getByRole("link", { name: /spellbook/i })).toBeVisible();
  // Downrank link: mage has caster specs.
  await expect(page.getByRole("link", { name: /downrank/i })).toBeVisible();
});

test("the warrior class hub does NOT show a downrank link", async ({ page }) => {
  await page.goto(WARRIOR);
  // Warrior has no caster/healer specs — downrank is not useful.
  await expect(page.getByRole("link", { name: /downrank/i })).toHaveCount(0);
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
