/**
 * WoW Forever "Your character" (/wow-forever/character) — E2E, network-stubbed.
 *
 *   - the hub tile opens the page; typing first name + surname opens /character/<slug>
 *   - the sheet: who they are, the render, gear rows with rolled stats, the tooltip on tap
 *   - the name is remembered and reopened on the next visit
 *   - an unknown name shows how to fix it and is never remembered
 *   - skeleton while Blizzard answers, then the loaded sheet in the same places
 *   - "Use for MGA's pages" sets the player's faction, class and level
 *   - the stats panel: a warlock opens on Spell, gear bonus in green, a picked tab is remembered
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
    stats: {
      health: 1032, power: 1295, power_type: "Mana",
      strength: { base: 33, effective: 33 }, agility: { base: 38, effective: 41 },
      stamina: { base: 52, effective: 80 }, intellect: { base: 74, effective: 92 },
      spirit: { base: 77, effective: 99 },
      melee: { attack_power: 23, main_hand: { min: 54, max: 81, speed: 3.4, dps: 19.9 }, off_hand: null, crit: 4.93, hit: 0, haste: 0, expertise: 0 },
      ranged: { attack_power: 0, damage: null, crit: 5.1, hit: 0, haste: 0 },
      spell: { power: 11, healing: 11, crit: 6.37, hit: 0, haste: 0, penetration: 0, mana_regen: 16, mana_regen_casting: 0 },
      defenses: { armor: { base: 82, effective: 312 }, defense: { base: 185, effective: 185 }, dodge: 3.86, parry: 0, block: 0 },
      resistances: { arcane: 0, fire: 0, frost: 0, nature: 0, shadow: 10 },
      movement_speed: 100,
    },
    // A real level 37 Affliction warlock's 28 points.
    talents: {
      groups: [
        {
          active: true,
          picks: [
            { id: 135456, rank: 2 }, { id: 135455, rank: 5 }, { id: 135451, rank: 3 }, { id: 135450, rank: 2 },
            { id: 135448, rank: 3 }, { id: 142628, rank: 5 }, { id: 135445, rank: 1 }, { id: 135443, rank: 1 },
            { id: 135442, rank: 3 }, { id: 135441, rank: 3 },
          ],
        },
      ],
    },
    professions: {
      primaries: [
        {
          id: 197, name: "Tailoring", skill: 148, max_skill: 225,
          recipes: [
            { id: 2359, name: "Bolt of Linen Cloth" }, { id: 2408, name: "Brown Linen Pants" },
            { id: 2380, name: "Handstitched Linen Britches" },
          ],
        },
        {
          id: 333, name: "Enchanting", skill: 128, max_skill: 225,
          recipes: [{ id: 7316, name: "Disenchant" }, { id: 4289, name: "Enchant Bracer - Minor Health" }],
        },
      ],
      secondaries: [
        { id: 185, name: "Cooking", skill: 187, max_skill: 225, recipes: [{ id: 3964, name: "Boiled Clams" }, { id: 2795, name: "Beer Basted Boar Ribs" }] },
        { id: 356, name: "Fishing", skill: 1, max_skill: 75, recipes: [{ id: 7620, name: "Fishing" }] },
      ],
    },
    reputations: [
      { id: 72, name: "Stormwind", standing: "Exalted", tier: 7, value: 0, max: 0 },
      { id: 47, name: "Ironforge", standing: "Honored", tier: 5, value: 7888, max: 12000 },
      { id: 21, name: "Booty Bay", standing: "Hostile", tier: 1, value: 1200, max: 3000 },
      { id: 68, name: "Undercity", standing: "Hated", tier: 0, value: 0, max: 36000 },
      { id: 2740, name: "Kirin Tor", standing: "Neutral", tier: 3, value: 250, max: 3000 },
    ],
    pvp: {
      rank: 0,
      honorable_kills: 21,
      deaths_from_players: 31,
      deaths_from_opposite_faction: 30,
      top_honor_continent: "Eastern Kingdoms",
      top_honor_continent_kills: 17,
    },
    collections: {
      mounts: [
        { id: 3111, name: "Cerulean Prideclaw", count: 1 },
        { id: 3130, name: "Veteran Adventurer's Loyal Companion", count: 1 },
      ],
      pets: [
        { id: 5161, name: "Mini Diablo", count: 1 },
        { id: 5138, name: "Pachimari", count: 2 },
      ],
    },
    dungeons: {
      runs: 20,
      dungeons: [
        { name: "Hall of Thanes", wing: null, classic: false, boss: "Durgen Dirgehammer", kills: 1, level_min: 13, level_max: 20, required_level: null },
        { name: "Deadmines", wing: null, classic: true, boss: "Edwin VanCleef", kills: 2, level_min: 16, level_max: 16, required_level: 10 },
        { name: "Scarlet Monastery", wing: "Graveyard", classic: true, boss: "Bloodmage Thalnos", kills: null, level_min: 30, level_max: 30, required_level: 20 },
        { name: "Uldaman", wing: null, classic: true, boss: "Archaedas", kills: 0, level_min: 35, level_max: 35, required_level: 30 },
        { name: "The Drowned City", wing: null, classic: false, boss: null, kills: null, level_min: 35, level_max: 42, required_level: null },
        { name: "Blackrock Depths", wing: null, classic: true, boss: "Emperor Dagran Thaurissan", kills: 0, level_min: 48, level_max: 48, required_level: 40 },
      ],
    },
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
  await expect(skeleton.getByTestId("character-talents-skeleton")).toBeVisible();
  await expect(skeleton.getByTestId("character-reputations-skeleton")).toBeVisible();
  await expect(skeleton.getByTestId("character-dungeons-skeleton")).toBeVisible();
  await expect(skeleton.getByTestId("character-pvp-skeleton")).toBeVisible();
  await expect(skeleton.getByTestId("character-collections-skeleton")).toBeVisible();
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

test("the stats panel opens a warlock on Spell and remembers a picked tab", async ({ page }) => {
  await stubCharacter(page);
  await page.goto("/wow-forever/character/jason-kwon");
  const panel = page.getByRole("region", { name: "Character stats" });
  await expect(panel.getByRole("tab", { name: "Spell" })).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByLabel("Spell stats")).toContainText("6.37%");
  await expect(panel.getByLabel("Attributes")).toContainText("92(+18 from gear, talents and buffs)");

  await panel.getByRole("tab", { name: "Melee" }).click();
  await expect(panel.getByLabel("Melee stats")).toContainText("Main hand damage54 – 81");
  await expect(panel.getByLabel("Melee stats")).not.toContainText("Off hand");

  await page.reload();
  await expect(page.getByRole("region", { name: "Character stats" }).getByRole("tab", { name: "Melee" })).toHaveAttribute("aria-selected", "true");
});

test("the talents section shows the point split and opens the build in the talent calculator", async ({ page }) => {
  await stubCharacter(page);
  await page.goto("/wow-forever/character/jason-kwon");
  const panel = page.getByRole("region", { name: "Talents" });
  await expect(panel.getByTestId("character-talent-split")).toContainText("Affliction 28");
  await expect(panel.getByTestId("talent-tree")).toHaveCount(3);
  await expect(panel.locator('[data-testid="character-talent-cell"]:not([data-rank="0"])')).toHaveCount(10);

  const suppression = panel.getByRole("button", { name: "Suppression, rank 2 of 5" });
  await suppression.click();
  await expect(suppression).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByTestId("character-talent-details")).toContainText("Rank 2/5");

  await panel.getByRole("link", { name: "Open in the talent calculator" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/talents\/warlock\?b=2-0250032003510133--&lvl=37/);
  await expect(page.getByText("28 of 28")).toBeVisible();
});

test("the professions section lists the recipes a profession knows and opens its guide at the character's skill", async ({ page }) => {
  await stubCharacter(page);
  await page.goto("/wow-forever/character/jason-kwon");
  const panel = page.getByRole("region", { name: "Professions" });
  await expect(panel.getByTestId("character-profession")).toHaveCount(4);
  await expect(panel.getByRole("button", { name: /Fishing/ })).toHaveCount(0);

  await panel.getByRole("button", { name: /Tailoring/ }).click();
  const recipes = panel.getByRole("region", { name: "Tailoring recipes" });
  // At 148 Tailoring these three are all gray: known, but no more skill-ups.
  await expect(recipes.getByTestId("character-recipe-group")).toHaveCount(1);
  await expect(recipes.locator('[data-color="grey"]')).toContainText("Gray · 3");
  await expect(recipes.locator('[data-color="grey"]')).toContainText("Handstitched Linen Britches");

  await recipes.getByRole("link", { name: "Tailoring guide from 148" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/professions\?p=tailoring&skill=148/);
});

test("the reputation section groups factions as the game does, own side open first", async ({ page }) => {
  await stubCharacter(page);
  await page.goto("/wow-forever/character/jason-kwon");
  const panel = page.getByRole("region", { name: "Reputation" });
  await expect(panel.getByTestId("character-reputation-group")).toHaveCount(4);
  const alliance = panel.getByRole("button", { name: /^Alliance/ });
  await expect(alliance).toHaveAttribute("aria-expanded", "true");
  const allianceList = panel.getByRole("list", { name: "Alliance factions" });
  await expect(allianceList.getByTestId("character-reputation").first()).toContainText("Ironforge");
  await expect(allianceList.getByTestId("character-reputation").first()).toContainText("7,888 / 12,000");
  await expect(allianceList.getByTestId("character-reputation-progress")).toHaveCount(1);

  const steamwheedle = panel.getByRole("button", { name: /Steamwheedle/ });
  await steamwheedle.click();
  await expect(alliance).toHaveAttribute("aria-expanded", "true");
  await expect(panel.getByRole("list", { name: "Steamwheedle Cartel factions" })).toContainText("Its guards attack you on sight");
  await expect(panel.getByRole("button").last()).toContainText("Other");
});

test("the PvP section starts closed with rank and kills, and opens to deaths to players", async ({ page }) => {
  await stubCharacter(page);
  await page.goto("/wow-forever/character/jason-kwon");
  const panel = page.getByRole("region", { name: "PvP" });
  const toggle = panel.getByRole("button", { name: /PvP/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toContainText("Unranked · 21 honorable kills");
  await expect(panel.getByTestId("character-pvp-rank")).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(panel.getByTestId("character-pvp-kills")).toContainText("Most in Eastern Kingdoms (17)");
  await expect(panel).toContainText("Deaths to players");
});

test("collections start closed with counts, and open to mounts and pets by name", async ({ page }) => {
  await stubCharacter(page);
  await page.goto("/wow-forever/character/jason-kwon");
  const panel = page.getByRole("region", { name: "Collections" });
  const toggle = panel.getByRole("button", { name: /Collections/ });
  await expect(toggle).toContainText("2 mounts, 2 pets");
  await expect(panel.getByRole("list", { name: "Mounts" })).toBeHidden();
  await toggle.click();
  await expect(panel.getByRole("list", { name: "Mounts" }).locator("li")).toHaveCount(2);
  await expect(panel.getByRole("list", { name: "Pets" })).toContainText("Pachimari ×2");
});

test("dungeons show done and not done in level order, with what fits now", async ({ page }) => {
  await stubCharacter(page);
  await page.goto("/wow-forever/character/jason-kwon");
  const panel = page.getByRole("region", { name: "Dungeons" });
  await expect(panel.getByRole("button", { name: /Dungeons/ })).toContainText("2 of 4 tracked done");
  const rows = panel.getByTestId("character-dungeon-row");
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(1)).toContainText("Done · 2 kills");
  await expect(rows.nth(3)).toContainText("Fits you now");
  await expect(rows.nth(4)).toContainText("Fits you now");
  await expect(rows.nth(5)).toContainText("needs level 40");
  await rows.nth(1).getByRole("link", { name: "Deadmines" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/dungeons\/deadmines$/);
});

test("a dungeon-kills failure keeps the rest of the sheet", async ({ page }) => {
  await page.route(SHEET_PATTERN, (route) => json(route, { ...character(), dungeons: null }));
  await page.route(RENDER_PATTERN, (route) => route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }));
  await page.goto("/wow-forever/character/jason-kwon");
  const panel = page.getByRole("region", { name: "Dungeons" });
  await expect(panel.getByRole("button", { name: /Dungeons/ })).toContainText("Couldn't load");
  await expect(page.getByRole("region", { name: "PvP" })).toBeVisible();
});

test("a PvP failure keeps the rest of the sheet", async ({ page }) => {
  await page.route(SHEET_PATTERN, (route) => json(route, { ...character(), pvp: null }));
  await page.route(RENDER_PATTERN, (route) => route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }));
  await page.goto("/wow-forever/character/jason-kwon");
  const panel = page.getByRole("region", { name: "PvP" });
  await expect(panel.getByRole("button", { name: /PvP/ })).toContainText("Couldn't load");
  await expect(page.getByRole("region", { name: "Reputation" })).toBeVisible();
});

test("a reputations failure keeps the rest of the sheet", async ({ page }) => {
  await page.route(SHEET_PATTERN, (route) => json(route, { ...character(), reputations: null }));
  await page.route(RENDER_PATTERN, (route) => route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }));
  await page.goto("/wow-forever/character/jason-kwon");
  await expect(page.getByRole("region", { name: "Reputation" })).toContainText("Blizzard didn't send this character's reputations");
  await expect(page.getByRole("region", { name: "Professions" })).toBeVisible();
});

test("a talents failure keeps the rest of the sheet", async ({ page }) => {
  await page.route(SHEET_PATTERN, (route) => json(route, { ...character(), talents: null }));
  await page.route(RENDER_PATTERN, (route) => route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }));
  await page.goto("/wow-forever/character/jason-kwon");
  await expect(page.getByRole("region", { name: "Talents" })).toContainText("Blizzard didn't send this character's talents");
  await expect(page.getByRole("region", { name: "Character stats" })).toBeVisible();
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
  await expect(page.getByRole("tab", { name: "Defenses" })).toBeVisible();
  const talents = page.getByRole("region", { name: "Talents" });
  // One tree at a time behind tabs, opening on the main tree.
  await expect(talents.getByRole("region", { name: "Affliction talents" })).toBeVisible();
  await expect(talents.getByRole("region", { name: "Demonology talents" })).toBeHidden();
  await talents.getByRole("radio", { name: /Demonology/ }).click();
  await expect(talents.getByRole("region", { name: "Demonology talents" })).toBeVisible();
  const link = await page.getByRole("link", { name: "Open in the talent calculator" }).boundingBox();
  expect(link?.height ?? 0).toBeGreaterThanOrEqual(44);
  const tab = await page.getByRole("tab", { name: "Defenses" }).boundingBox();
  expect(tab?.height ?? 0).toBeGreaterThanOrEqual(44);
  const header = await page.getByRole("button", { name: /Steamwheedle/ }).boundingBox();
  expect(header?.height ?? 0).toBeGreaterThanOrEqual(44);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
