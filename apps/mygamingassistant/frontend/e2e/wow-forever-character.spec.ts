/**
 * WoW Forever "Your character" (/wow-forever/character) — E2E, network-stubbed.
 *
 *   - the hub tile opens the page; typing first name + surname opens /character/<slug>
 *   - the sheet: who they are, the render, gear rows with rolled stats, the tooltip on tap
 *   - the name is remembered and reopened on the next visit
 *   - an unknown name shows how to fix it and is never remembered
 *   - skeleton while Blizzard answers, then the loaded sheet in the same places
 *   - "Use for MGA's pages" sets the player's faction, class and level
 *   - 375px phone layout: picture first, no horizontal overflow
 *
 * Stubbed: `/wow/characters/<slug>` (JSON) and `/wow/characters/<slug>/render.png`.
 *
 * Run: npm run test:e2e -- wow-forever-character
 */
import { test, expect, type Page, type Route } from "@playwright/test";

const SHEET_PATTERN = (url: URL) => /\/wow\/characters\/[^/]+$/.test(url.pathname);
const RENDER_PATTERN = "**/wow/characters/*/render.png";

// A 1x1 transparent PNG.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function character() {
  return {
    slug: "jason-kwon",
    name: "Jason",
    surname: "Kwon",
    level: 37,
    race: "Gnome",
    class_id: 9,
    class_name: "Warlock",
    gender: "Female",
    faction: "alliance",
    guild: "topdeadcenter",
    ruleset: "PvP",
    equipped_item_level: 28,
    last_login: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    has_render: true,
    items: [
      {
        slot: "HEAD", item_id: 3556, name: "Dread Mage Hat", quality: "uncommon", item_level: 30,
        inventory_type: "HEAD", inventory_type_name: "Head", subclass_name: "Cloth",
        binding: "Binds when equipped", armor: "35 Armor", weapon: null,
        stats: [{ text: "+7 Intellect", equip_bonus: false }, { text: "+7 Spirit", equip_bonus: false }],
        enchantments: [], spells: [], set_name: null, requirements: ["Requires Level 25"],
        durability: "Durability 21 / 45", durability_low: true, description: null,
      },
      {
        slot: "MAIN_HAND", item_id: 1155, name: "Rod of the Sleepwalker", quality: "rare", item_level: 32,
        inventory_type: "TWOHWEAPON", inventory_type_name: "Two-Hand", subclass_name: "Staff",
        binding: "Binds when picked up", armor: null,
        weapon: { damage: "54 - 81 Damage", speed: "Speed 3.40", dps: "(19.9 damage per second)" },
        stats: [{ text: "+11 Intellect", equip_bonus: false }],
        enchantments: [], spells: ["Equip: Increases damage and healing done by magical spells and effects by up to 11."],
        set_name: null, requirements: [], durability: "Durability 100 / 100", durability_low: false, description: null,
      },
    ],
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function stubCharacter(page: Page) {
  await page.route(SHEET_PATTERN, (route) => json(route, character()));
  await page.route(RENDER_PATTERN, (route) => route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }));
}

test("the hub tile opens the page, and a typed name opens the character's sheet", async ({ page }) => {
  await stubCharacter(page);
  await page.goto("/wow-forever");
  await page.getByRole("link", { name: /Your character/ }).first().click();
  await expect(page).toHaveURL(/\/wow-forever\/character$/);

  await page.getByLabel(/Character name/).fill("Jason Kwon");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/character\/jason-kwon$/);

  await expect(page.getByRole("heading", { name: "Jason Kwon" })).toBeVisible();
  await expect(page.getByText(/Level 37 Gnome Warlock/)).toBeVisible();
  await expect(page.getByRole("img", { name: /Jason Kwon in their current gear/ })).toBeVisible();
  const hat = page.getByRole("button", { name: /Dread Mage Hat/ });
  await expect(hat).toContainText("+7 Spirit");
  await expect(hat).toContainText("Repair soon");
  await expect(page.getByText("Two-hand weapon equipped")).toBeVisible();

  const staff = page.getByRole("button", { name: /Rod of the Sleepwalker/ });
  await staff.click();
  await expect(staff).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("character-item-details")).toContainText("54 - 81 Damage");
});

test("the name is remembered and reopened on the next visit", async ({ page }) => {
  await stubCharacter(page);
  await page.goto("/wow-forever/character/jason-kwon");
  await expect(page.getByRole("heading", { name: "Jason Kwon" })).toBeVisible();

  await page.goto("/wow-forever/character");
  await expect(page).toHaveURL(/\/wow-forever\/character\/jason-kwon$/);
  await expect(page.getByRole("button", { name: "Jason Kwon", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("an unknown name says how to fix it and is never remembered", async ({ page }) => {
  await page.route(SHEET_PATTERN, (route) => json(route, { detail: "character_not_found" }, 404));
  await page.goto("/wow-forever/character/nobody-here");
  await expect(page.getByRole("alert")).toContainText(/no character by that name/i);
  const stored = await page.evaluate(() => window.localStorage.getItem("mga.wowForever.character.v1"));
  expect(stored).toBeNull();
});

test("skeleton while Blizzard answers, then the sheet in the same places", async ({ page }) => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(SHEET_PATTERN, async (route) => {
    await held;
    await json(route, character());
  });
  await page.route(RENDER_PATTERN, (route) => route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }));
  await page.goto("/wow-forever/character/jason-kwon");

  const skeleton = page.getByTestId("character-sheet-skeleton");
  await expect(skeleton).toBeVisible();
  const skeletonBox = await skeleton.boundingBox();

  release();
  await expect(skeleton).toHaveCount(0);
  const gear = page.getByRole("region", { name: "Equipped gear" });
  await expect(gear).toBeVisible();
  await expect(page.getByRole("list", { name: "Left side" }).locator("li")).toHaveCount(8);
  await expect(page.getByRole("list", { name: "Right side" }).locator("li")).toHaveCount(8);
  const gearBox = await gear.boundingBox();
  expect(Math.abs((gearBox?.x ?? 0) - (skeletonBox?.x ?? 0))).toBeLessThan(2);
});

test("Use for MGA's pages sets the player's faction, class and level", async ({ page }) => {
  await stubCharacter(page);
  await page.goto("/wow-forever/character/jason-kwon");
  await page.getByRole("button", { name: "Use for MGA's pages" }).click();
  await expect(page.getByRole("button", { name: /MGA's pages use this character/ })).toBeDisabled();
  const saved = await page.evaluate(() => window.localStorage.getItem("mga.wowForever.worldMap.player.v1"));
  expect(JSON.parse(saved ?? "{}")).toMatchObject({ faction: "A", classId: "warlock", level: 37 });
});

test("375px phone layout: the picture comes first and nothing overflows", async ({ page }) => {
  await stubCharacter(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/wow-forever/character/jason-kwon");
  const picture = page.getByRole("img", { name: /Jason Kwon in their current gear/ });
  await expect(picture).toBeVisible();
  const pictureBox = await picture.boundingBox();
  const firstRow = await page.getByRole("list", { name: "Left side" }).locator("li").first().boundingBox();
  expect(pictureBox?.y ?? 0).toBeLessThan(firstRow?.y ?? 0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
