/**
 * WoW Forever Drop-only recipes — Enchanting by default, the source filter and
 * sort kept in the URL, opening a row for the spots and whether it trades, the
 * phone layout and the loading skeleton (same shape as the loaded page), and a
 * character's known recipes (stubbed `/wow/characters/<slug>`) crossed out.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-recipe-drops
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";

const PAGE = "/wow-forever/recipe-drops";

async function noSideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// No backend in this run: icons answer 404 and show their placeholder.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/wow/icons/**", (route) => route.fulfill({ status: 404, body: "" }));
});

test("lists Enchanting's drop-only formulas by skill, with a raid filter and best-odds sort kept in the URL", async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.getByRole("heading", { level: 1, name: "Drop-only recipes" })).toBeVisible();
  await expect(page).toHaveTitle(/Drop-only recipes · WoW Forever/);
  await expect(page.getByRole("radiogroup", { name: "Profession" }).getByRole("radio", { name: "Enchanting" })).toHaveAttribute("aria-checked", "true");
  const rows = page.getByTestId("drop-recipe-row");
  await expect(rows.first()).toContainText("Enchanting");
  await expect(page.getByTestId("drop-recipes-note")).toContainText("Classic data");

  await page.getByRole("radiogroup", { name: "Where it drops" }).getByRole("radio", { name: "Raid" }).click();
  await expect(page).toHaveURL(/source=raid/);
  await page.getByRole("radiogroup", { name: "Sort by" }).getByRole("radio", { name: "Best odds" }).click();
  await expect(page).toHaveURL(/sort=odds/);
  await expect(rows.first().getByTestId("drop-recipe-source").filter({ hasText: "Raid" })).toHaveCount(1);

  await page.reload();
  await expect(page.getByRole("radiogroup", { name: "Where it drops" }).getByRole("radio", { name: "Raid" })).toHaveAttribute("aria-checked", "true");
});

test("a dungeon formula opens to its boss, the door's Directions, and an Auction House link", async ({ page }) => {
  await page.goto(`${PAGE}?source=dungeon`);
  const fiery = page.getByTestId("drop-recipe-row").filter({ hasText: "Enchant Weapon - Fiery Weapon" });
  await expect(fiery.getByTestId("drop-recipe-summary")).toContainText("Pyromancer Loregrain, Blackrock Depths · 40%");
  await fiery.locator("summary").click();
  await expect(fiery.getByTestId("drop-recipe-instances")).toContainText("In Blackrock Depths");
  await expect(fiery.getByRole("link", { name: /Directions to Blackrock Depths entrance/ })).toBeVisible();
  await expect(fiery.getByTestId("drop-recipe-trade").getByRole("link", { name: "Check the Auction House" })).toHaveAttribute("href", /auction-house\?/);
});

test("a random drop lists no farm mobs, and a bind-on-pickup raid formula has no Auction House link", async ({ page }) => {
  await page.goto(PAGE);
  const spirit = page.getByTestId("drop-recipe-row").filter({ hasText: "Enchant Bracer - Minor Spirit" });
  await spirit.locator("summary").click();
  await expect(spirit.getByTestId("drop-recipe-random")).toContainText("no good farm spot");
  await expect(spirit.getByTestId("drop-recipe-targets")).toHaveCount(0);

  await page.goto(`${PAGE}?source=raid`);
  const dodge = page.getByTestId("drop-recipe-row").filter({ hasText: "Enchant Cloak - Dodge" });
  await dodge.locator("summary").click();
  await expect(dodge.getByTestId("drop-recipe-trade")).toContainText("Binds when picked up");
  await expect(dodge.getByRole("link", { name: "Check the Auction House" })).toHaveCount(0);
});

/** Jason Kwon knows Fiery Weapon (Blizzard recipe 7670 → spell 13898). */
const JASON = {
  slug: "jason-kwon",
  name: "Jason",
  surname: "Kwon",
  last_login: null,
  professions: {
    primaries: [{ id: 333, name: "Enchanting", skill: 225, max_skill: 300, recipes: [{ id: 7670, name: "Enchant Weapon - Fiery Weapon" }] }],
    secondaries: [],
  },
};

test("a character's known recipes are crossed out, kept in the URL, and cleared with Clear", async ({ page }) => {
  await page.route(/\/api\/wow\/characters\/[^/]+$/, (route) =>
    route.request().url().endsWith("/jason-kwon")
      ? route.fulfill({ json: JASON })
      : route.request().url().endsWith("/no-enchanter")
        ? route.fulfill({ json: { ...JASON, slug: "no-enchanter", name: "No", surname: "Enchanter", professions: { primaries: [], secondaries: [] } } })
        : route.fulfill({ status: 404, json: { detail: "not found" } }),
  );
  await page.goto(`${PAGE}?source=dungeon`);
  const rows = page.getByTestId("drop-recipe-row");
  const fiery = rows.filter({ hasText: "Enchant Weapon - Fiery Weapon" });
  await expect(fiery).toHaveCount(1);
  const before = await rows.count();

  await page.getByLabel("Character name (first name and surname)").fill("Jason Kwon");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page).toHaveURL(/who=jason-kwon/);
  await expect(page.getByTestId("drop-recipe-known")).toContainText("Crossed out: what Jason Kwon knows (Enchanting 225 / 300).");
  await expect(fiery).toHaveAttribute("data-known", "true");
  await expect(fiery.getByTestId("drop-recipe-known-badge")).toHaveText("Known");
  await expect(fiery.locator("summary").getByText("Enchant Weapon - Fiery Weapon", { exact: true })).toHaveCSS("text-decoration-line", "line-through");
  await expect(rows).toHaveCount(before);
  await expect(page.locator('[data-testid="drop-recipe-row"][data-known]')).toHaveCount(1);
  await expect(page.getByTestId("drop-recipe-count")).toContainText("Jason Kwon knows 1");

  await page.reload();
  await expect(fiery).toHaveAttribute("data-known", "true");
  await expect(page.getByRole("button", { name: "Jason Kwon" })).toBeVisible();

  await page.getByRole("button", { name: "Clear character" }).click();
  await expect(page).not.toHaveURL(/who=/);
  await expect(fiery).not.toHaveAttribute("data-known", "true");

  await page.getByLabel("Character name (first name and surname)").fill("Nobody Here");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.getByTestId("drop-recipe-known")).toContainText("Blizzard doesn't know a character named Nobody Here");
  await expect(page.locator('[data-testid="drop-recipe-row"][data-known]')).toHaveCount(0);

  await page.getByLabel("Character name (first name and surname)").fill("No Enchanter");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.getByTestId("drop-recipe-known")).toContainText("No Enchanter hasn't learned Enchanting, so nothing is crossed out.");
  await page.getByRole("radiogroup", { name: "Where it drops" }).getByRole("radio", { name: "Raid" }).click();
  await expect(page).toHaveURL(/who=no-enchanter/);
});

test("fits a phone with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PAGE);
  const row = page.getByTestId("drop-recipe-row").first();
  await row.locator("summary").click();
  expect(await noSideways(page)).toBeLessThanOrEqual(0);
});

test("the loading skeleton has the loaded page's shape", async ({ page }) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/professions/crafting/enchanting.json*", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(PAGE);
  const skeleton = page.getByTestId("drop-recipes-skeleton");
  await expect(skeleton).toBeVisible();
  const skeletonButtons = await skeleton.locator(".grid > div").count();
  release();
  await expect(page.getByTestId("drop-recipe-row").first()).toBeVisible();
  const loadedButtons = await page.getByRole("radiogroup", { name: "Profession" }).getByRole("radio").count();
  expect(skeletonButtons).toBe(loadedButtons);
  await expect(page.getByRole("region", { name: "Look up a character" })).toBeVisible();
});
