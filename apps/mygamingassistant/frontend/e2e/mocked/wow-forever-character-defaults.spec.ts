/**
 * WoW Forever pages start from the selected character — E2E, network-stubbed.
 *
 *   - World Map: the saved level 40 follows the character (59); a typed level sticks until
 *     "Use <name>'s" puts the character's back
 *   - Professions: opens on the character's own profession at its real skill; a typed skill
 *     sticks until the reset
 *
 * Stubbed: `/wow/characters/<slug>`. The player was saved with "Use for MGA's pages" back
 * when the character was level 40.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-character-defaults
 */
import type { Route } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { stubEmptyPrices } from "./fixtures/emptyPrices";

const SHEET_PATTERN = (url: URL) => /\/wow\/characters\/[^/]+$/.test(url.pathname);
const SAVED_PLAYER = { faction: "A", classId: "warlock", zoneId: null, level: 40, position: null, characterSlug: "jason-kwon" };

function character() {
  return {
    slug: "jason-kwon", name: "Jason", surname: "Kwon", level: 59, race: "Gnome", class_id: 9, class_name: "Warlock",
    gender: "Female", faction: "alliance", guild: null, guild_slug: null, ruleset: "PvP", equipped_item_level: 50,
    last_login: new Date().toISOString(), has_render: false, items: [], stats: null, talents: null,
    professions: {
      primaries: [{ id: 197, name: "Tailoring", skill: 254, max_skill: 300, recipes: [] }],
      secondaries: [{ id: 185, name: "Cooking", skill: 150, max_skill: 225, recipes: [] }],
    },
  };
}

function json(route: Route, body: unknown) {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
  await stubEmptyPrices(page);
  await page.route(SHEET_PATTERN, (route) => json(route, character()));
  await page.addInitScript((player) => {
    if (!window.localStorage.getItem("mga.wowForever.worldMap.player.v1")) {
      window.localStorage.setItem("mga.wowForever.worldMap.player.v1", JSON.stringify(player));
    }
  }, SAVED_PLAYER);
});

test("the map's level follows the character, and a typed level sticks until the reset", async ({ page }) => {
  await page.goto("/wow-forever/map");
  const level = page.locator("#wm-level");
  await expect(level).toHaveValue("59");

  await level.fill("30");
  await expect(level).toHaveValue("30");
  await page.reload();
  await expect(level).toHaveValue("30");

  await page.getByRole("button", { name: "Use Jason Kwon's" }).click();
  await expect(level).toHaveValue("59");
  await expect(page.getByRole("button", { name: "Use Jason Kwon's" })).toHaveCount(0);
});

test("professions open on the character's profession at its real skill, and a typed skill sticks", async ({ page }) => {
  await page.goto("/wow-forever/professions");
  await expect(page.getByRole("radio", { name: "Tailoring" })).toBeChecked();
  const skill = page.getByLabel("Your skill");
  await expect(skill).toHaveValue("254");

  await skill.fill("100");
  await page.reload();
  await expect(skill).toHaveValue("100");

  await page.getByRole("button", { name: "Use Jason Kwon's" }).first().click();
  await expect(skill).toHaveValue("254");
});
