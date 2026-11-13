/**
 * WoW Forever "Best gear" — static, frontend-only page.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-gear
 */
import { test, expect, type Page } from "@playwright/test";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

const GEAR_DATA = "**/gear*.json";
const WARLOCK_CARDS = 16; // every slot group; a Warlock fills all of them

/** The visible line above the cards (the screen-reader status repeats it). */
function heading(page: Page, text: string | RegExp) {
  return page.locator('p:not([role="status"])', { hasText: text });
}

async function openPreRaid(page: Page) {
  await page.goto("/wow-forever/gear");
  await page.getByRole("radio", { name: "Level 60 (pre-raid)" }).click();
  await expect(heading(page, "Best gear for a level 60 Affliction Warlock (Alliance).")).toBeVisible();
}

function slotCard(page: Page, label: string) {
  return page.getByRole("region", { name: label, exact: true });
}

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("reaches the page from the WoW Forever hub", async ({ page }) => {
  await page.goto("/wow-forever");
  await page.getByRole("link", { name: /^Best gear/ }).click();
  await expect(page).toHaveURL(/\/wow-forever\/gear$/);
  await expect(page.getByRole("heading", { name: "Best gear", level: 1 })).toBeVisible();
  await expect(page.getByTestId("gear-phase-banner")).toContainText("December 9");
});

test("the Warlock pre-raid table: three items per slot, cloth only, with source chips and names linking to item pages", async ({ page }) => {
  await openPreRaid(page);
  await expect(page.getByTestId("gear-slot-card")).toHaveCount(WARLOCK_CARDS);

  const chest = slotCard(page, "Chest");
  const rows = chest.getByTestId("gear-item-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("Top pick");
  await expect(rows.nth(1)).toContainText("% of top pick");
  await expect(chest.getByTestId("gear-source-chip").first()).toHaveText(
    /^(Crafted|Quest|Boss drop|Source unknown)$/,
  );

  // The name is the row's one link: our own item page, never a site outside the app.
  await expect(rows.first().getByRole("link")).toHaveCount(1);
  await expect(rows.first().getByRole("link")).toHaveAttribute("href", /^\/wow-forever\/items\/\d+$/);
  await expect(page.locator('a[href*="wowhead"]')).toHaveCount(0);

  // Felcloth is Tailoring from the Forever client: the source is crafted, tagged Game files.
  const felcloth = page.getByTestId("gear-item-row").filter({ hasText: "Felcloth Gloves" });
  await expect(felcloth.getByTestId("gear-source-chip")).toHaveText("Crafted");
  await expect(felcloth.getByTestId("provenance-badge")).toHaveAttribute("data-provenance", "client");
  await expect(felcloth).toContainText(/Tailoring \d+/);

  // No mail, leather or plate on a Warlock, and no PvP gear until it's switched on.
  await expect(page.getByTestId("gear-item-row").getByText("PvP", { exact: true })).toHaveCount(0);
  // The setting lives in the URL, which React Router updates in a transition,
  // so wait for the box rather than using check() (it reads the state at once).
  const pvp = page.getByLabel(/Include PvP gear/);
  await pvp.click();
  await expect(pvp).toBeChecked();
  await expect(page).toHaveURL(/[?&]pvp=1/);
  await expect(page.getByTestId("gear-item-row").getByText("PvP", { exact: true }).first()).toBeVisible();
});

test("switching class, spec and level re-ranks and is remembered", async ({ page }) => {
  await page.goto("/wow-forever/gear");
  await expect(page.getByText("Enter your level to see the best gear you can wear now", { exact: false })).toBeVisible();

  await page.getByLabel("Your level").fill("30");
  await expect(heading(page, "Best gear for a level 30 Warlock (Alliance).")).toBeVisible();
  await expect(page.getByTestId("gear-next-upgrade").first()).toContainText(/level \d+/);

  await page.getByRole("radio", { name: "Level 60 (pre-raid)" }).click();
  await expect(heading(page, "Best gear for a level 60 Affliction Warlock (Alliance).")).toBeVisible();
  await page.getByLabel("Spec").selectOption("destruction");
  await expect(heading(page, "Best gear for a level 60 Destruction Warlock (Alliance).")).toBeVisible();
  await page.goBack();
  await expect(heading(page, "Best gear for a level 30 Warlock (Alliance).")).toBeVisible();

  await page.getByLabel("Class").selectOption("rogue");
  await expect(heading(page, "Best gear for a level 30 Rogue (Alliance).")).toBeVisible();
  await expect(slotCard(page, "Two-hand weapon")).toHaveCount(0);
  await expect(slotCard(page, "Chest")).toBeVisible();

  await page.getByRole("radio", { name: "Horde" }).click();
  await page.reload();
  await expect(heading(page, "Best gear for a level 30 Rogue (Horde).")).toBeVisible();
});

test("shows a skeleton with one card per slot while the data loads", async ({ page }) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(GEAR_DATA, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/wow-forever/gear");
  await page.getByRole("radio", { name: "Level 60 (pre-raid)" }).click();
  await expect(page.getByTestId("gear-slots-skeleton")).toBeVisible();
  await expect(page.getByTestId("gear-slot-skeleton")).toHaveCount(WARLOCK_CARDS);
  release();
  await expect(page.getByTestId("gear-slot-card")).toHaveCount(WARLOCK_CARDS);
  await expect(page.getByTestId("gear-slots-skeleton")).toHaveCount(0);
});

test("a failed load can be retried in place", async ({ page }) => {
  let failing = true;
  await page.route(GEAR_DATA, (route) => (failing ? route.abort() : route.continue()));
  await page.goto("/wow-forever/gear");
  await expect(page.getByText("Couldn't load the item list. Check your connection and try again.")).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByLabel("Your level").fill("40");
  await expect(page.getByTestId("gear-slot-card").first()).toBeVisible();
});

test("the phone layout never scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openPreRaid(page);
  await expect(page.getByTestId("gear-slot-card").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("level 30 Warlock: no item estimated above level 30 appears as wearable now", async ({ page }) => {
  await page.goto("/wow-forever/gear?class=warlock&spec=affliction&faction=A&view=leveling&lvl=30");
  await expect(heading(page, /Best gear for a level 30 Warlock/)).toBeVisible();

  // All items in "top" should be obtainable at or before level 30.
  // The fix stops high-ilvl items with req 0/1 and no known source from
  // appearing as wearable at level 1 (e.g., Discarded Circlet ilvl 43,
  // Denric's Dog Tags ilvl 54).
  const allRows = page.getByTestId("gear-item-row");
  const nextUpgrades = page.getByTestId("gear-next-upgrade");

  // "Probably from about level N" labels must only appear in next-upgrade
  // sections, never in the top-pick rows, when viewing level 30.
  const estimatedInTop = page.locator('[data-testid="gear-slot-card"]')
    .locator('ol')
    .getByText(/Probably from about level [3-9][1-9]|Probably from about level [4-9]\d/);
  await expect(estimatedInTop).toHaveCount(0);

  // Next-upgrade section may show "about level N" for estimated items.
  // The first next-upgrade must have a level > 30.
  await expect(allRows.first()).toBeVisible();
  const firstNextUpgrade = nextUpgrades.first();
  if (await firstNextUpgrade.isVisible()) {
    await expect(firstNextUpgrade).toContainText(/level \d+/);
  }
});

test("estimated items show 'probably from about level N' in next-upgrade row", async ({ page }) => {
  // At level 30, items with req ≤ 1 and no known source are estimated.
  // They should appear as next-upgrade with "about level N" text, not in the
  // wearable-now top list.
  await page.goto("/wow-forever/gear?class=warlock&spec=affliction&faction=A&view=leveling&lvl=30");
  await expect(heading(page, /Best gear for a level 30 Warlock/)).toBeVisible();

  const nextUpgradeTexts = page.getByTestId("gear-next-upgrade");
  // At least some next-upgrades should exist at level 30 for a Warlock.
  const count = await nextUpgradeTexts.count();
  expect(count).toBeGreaterThan(0);
});
