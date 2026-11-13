/**
 * WoW Forever guild page (/wow-forever/guild/:slug) — E2E, network-stubbed.
 *
 *   - the guild badge on a character's sheet opens the guild page, marking that character
 *   - recipe search: who knows a recipe, with their skill; the search lives in the URL
 *   - leaderboards: pick a board, ties share a rank, the board lives in the URL
 *   - gains boards ("This week"): who gained what since when, and who isn't ranked
 *   - faction standing board: pick a faction (in the URL), ranked by tier, an old link falls back, retry
 *   - members by rank; a name opens that member's character page
 *   - search, class filter and column sort, kept in the URL across Back
 *   - nothing matches → Clear filters brings everyone back
 *   - a guild we don't have yet says how to get it collected
 *   - skeleton while loading, then the list in the same place
 *   - 375px phone layout: members as cards, nothing overflows
 *   - the Guild menu item: search by name → open a guild; once a character is looked up it opens
 *     their guild, and "Find another guild" gets back to the search (on a phone too)
 *
 * Stubbed: `/wow/guilds?q=`, `/wow/guilds/<slug>`, `/wow/guilds/<slug>/recipes`, `/wow/guilds/<slug>/reputations`, `/wow/characters/<slug>` and its render.
 *
 * Run: npm run test:e2e -- wow-forever-guild
 */
import { test, expect, type Locator, type Page, type Route } from "@playwright/test";

const GUILD_PATTERN = (url: URL) => /\/wow\/guilds\/[^/]+$/.test(url.pathname);
const RECIPES_PATTERN = (url: URL) => /\/wow\/guilds\/[^/]+\/recipes$/.test(url.pathname);
const SHEET_PATTERN = (url: URL) => /\/wow\/characters\/[^/]+$/.test(url.pathname);
const SEARCH_PATTERN = (url: URL) => /\/wow\/guilds$/.test(url.pathname);
const RENDER_PATTERN = "**/wow/characters/*/render.png";
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function member(slug: string, name: string, surname: string, className: string, level: number, itemLevel: number | null, rank: number) {
  return {
    slug,
    name,
    surname,
    class_name: className,
    level,
    item_level: itemLevel,
    honorable_kills: null,
    killing_blows: null,
    deaths_from_players: null,
    total_kills: null,
    total_deaths: null,
    dungeons_done: null,
    exalted_reputations: null,
    baseline: null,
    professions: [] as { id: number; skill: number; max_skill: number }[],
    rank,
    refreshed_at: new Date(Date.now() - 3_600_000).toISOString(),
  };
}

function guild() {
  return {
    slug: "topdeadcenter",
    name: "TopDeadCenter",
    faction: "alliance",
    roster_size: 4,
    roster_updated_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    refresh_failed: false,
    gone: false,
    gains_window_days: 7,
    members: [
      { ...member("jason-kwon", "Jason", "Kwon", "Warlock", 37, 28, 0), honorable_kills: 40,
        professions: [{ id: 197, skill: 148, max_skill: 225 }] },
      { ...member("big-sue", "Big", "Sue", "Warrior", 60, null, 1), honorable_kills: 40 },
      { ...member("tiny-john", "Tiny", "John", "Mage", 12, 8, 3), honorable_kills: 112 },
    ],
  };
}

function character(slug: string) {
  const [name, surname] = slug.split("-").map((s) => s[0].toUpperCase() + s.slice(1));
  return {
    slug, name, surname, level: 37, race: "Gnome", class_id: 9, class_name: "Warlock", gender: "Female",
    faction: "alliance", guild: "TopDeadCenter", guild_slug: "topdeadcenter", ruleset: "PvP",
    equipped_item_level: 28, last_login: null, has_render: false, items: [], stats: null,
    talents: null, professions: null, reputations: null, pvp: null,
    collections: { mounts: [], pets: [] }, dungeons: null,
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function stubAll(page: Page) {
  await page.route(GUILD_PATTERN, (route) => json(route, guild()));
  await page.route(SHEET_PATTERN, (route) => json(route, character(new URL(route.request().url()).pathname.split("/").pop() ?? "")));
  await page.route(RENDER_PATTERN, (route) => route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }));
}

function memberNames(page: Page) {
  return page.getByRole("table").getByRole("link");
}

test("the guild badge opens the guild page, and a member's name opens their character", async ({ page }) => {
  await stubAll(page);
  await page.goto("/wow-forever/character/jason-kwon");
  await page.getByRole("link", { name: /Guild TopDeadCenter: see its members/ }).click();
  await expect(page).toHaveURL(/\/wow-forever\/guild\/topdeadcenter\?me=jason-kwon$/);

  await expect(page.getByRole("heading", { name: "<TopDeadCenter>" })).toBeVisible();
  const levelBoard = page.getByRole("list", { name: "Level leaderboard" }).locator("li");
  await expect(levelBoard).toHaveCount(3);
  await expect(levelBoard.nth(1)).toContainText("Jason Kwon");
  await expect(levelBoard.nth(1)).toContainText("You");
  await expect(page.getByText("3 of 4 members shown")).toBeVisible();
  await expect(page.getByText(/1 member has no profile from Blizzard/)).toBeVisible();
  await expect(memberNames(page)).toHaveText(["Jason Kwon", "Big Sue", "Tiny John"]);

  await memberNames(page).filter({ hasText: "Tiny John" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/character\/tiny-john$/);
  await expect(page.getByRole("heading", { name: "Tiny John" })).toBeVisible();
});

test("search, class filter and sort live in the URL and survive Back", async ({ page }) => {
  await stubAll(page);
  await page.goto("/wow-forever/guild/topdeadcenter");

  await page.getByRole("table").getByRole("button", { name: "Level", exact: true }).click();
  await expect(memberNames(page)).toHaveText(["Big Sue", "Jason Kwon", "Tiny John"]);
  await expect(page).toHaveURL(/sort=level/);

  await page.getByLabel("Class").selectOption("Mage");
  await expect(memberNames(page)).toHaveText(["Tiny John"]);
  await expect(page.getByRole("status").filter({ hasText: "Showing" })).toHaveText("Showing 1 of 3 members");

  await memberNames(page).first().click();
  await expect(page).toHaveURL(/\/wow-forever\/character\/tiny-john$/);
  await page.goBack();
  await expect(page).toHaveURL(/class=Mage/);
  await expect(memberNames(page)).toHaveText(["Tiny John"]);

  await page.getByLabel("Name").fill("nobody");
  await expect(page.getByText("No members match.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(memberNames(page)).toHaveText(["Jason Kwon", "Big Sue", "Tiny John"]);
  await expect(page).toHaveURL(/\/wow-forever\/guild\/topdeadcenter$/);
});

test("a guild we don't have yet says how to get it collected", async ({ page }) => {
  await page.route(GUILD_PATTERN, (route) => json(route, { detail: "guild_not_found" }, 404));
  await page.goto("/wow-forever/guild/nobody-here");
  await expect(page.getByText(/We don't have this guild yet/)).toBeVisible();
  await page.getByRole("link", { name: "Look up a character" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/character$/);
});

test("skeleton while loading, then the member list in the same place", async ({ page }) => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(GUILD_PATTERN, async (route) => {
    await held;
    await json(route, guild());
  });
  await page.goto("/wow-forever/guild/topdeadcenter");
  const skeleton = page.getByTestId("guild-page-skeleton");
  await expect(skeleton).toBeVisible();
  await expect(page.getByTestId("guild-recipe-search-skeleton")).toBeVisible();
  await expect(page.getByTestId("guild-leaderboard-skeleton")).toBeVisible();
  await expect(page.getByTestId("guild-podium-skeleton")).toBeVisible();
  await expect(page.getByTestId("guild-titles-skeleton")).toBeVisible();
  const skeletonBox = await skeleton.boundingBox();
  const podiumHeights = async (cards: Locator) =>
    cards.evaluateAll((els) => els.slice(0, 2).map((e) => e.getBoundingClientRect().height));
  const skeletonCards = await podiumHeights(page.getByTestId("guild-podium-skeleton").locator(":scope > div:first-child > div"));

  release();
  await expect(skeleton).toHaveCount(0);
  const summary = page.getByRole("region", { name: "Guild", exact: true });
  await expect(summary).toBeVisible();
  const summaryBox = await summary.boundingBox();
  expect(Math.abs((summaryBox?.x ?? 0) - (skeletonBox?.x ?? 0))).toBeLessThan(2);
  await expect(memberNames(page)).toHaveCount(3);
  await expect(page.getByRole("region", { name: "Leaderboards" })).toBeVisible();
  // The podium skeleton is the loaded podium's size, so the board doesn't jump when it arrives.
  const loadedCards = await podiumHeights(page.getByRole("list", { name: "Level leaderboard" }).locator("li"));
  loadedCards.forEach((height, i) => expect(Math.abs(height - skeletonCards[i])).toBeLessThan(4));
  await expect(page.getByRole("region", { name: "Who can craft this?" })).toBeVisible();
});

test("375px phone layout: members as cards and nothing overflows", async ({ page }) => {
  await stubAll(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/wow-forever/guild/topdeadcenter");
  const cards = page.getByRole("list", { name: "Guild members" }).locator("li");
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toContainText("Level 37 · Warlock · item level 28 · Guild master");
  await expect(page.getByRole("table")).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("leaderboards: pick a board, ties share a rank, and the board survives Back", async ({ page }) => {
  await stubAll(page);
  await page.goto("/wow-forever/guild/topdeadcenter");

  await page.getByRole("button", { name: "PvP" }).click();
  await expect(page.getByRole("button", { name: "PvP" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Rank members by").selectOption("honorable-kills");
  await expect(page).toHaveURL(/board=honorable-kills/);
  const rows = page.getByRole("list", { name: "Honorable kills leaderboard" }).locator("li");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Tiny John");
  await expect(rows.nth(0)).toContainText("112");
  // Big Sue and Jason Kwon tie on 40: both are 2nd, by name.
  await expect(rows.nth(1)).toContainText(/^2.*Big Sue/);
  await expect(rows.nth(2)).toContainText(/^2.*Jason Kwon/);

  await page.getByRole("button", { name: "Professions" }).click();
  await page.getByLabel("Rank members by").selectOption("prof-tailoring");
  const tailors = page.getByRole("list", { name: "Tailoring leaderboard" }).locator("li");
  await expect(tailors).toHaveCount(1);
  await expect(tailors.first()).toContainText("148 / 225");

  await tailors.first().getByRole("link", { name: "Jason Kwon" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/character\/jason-kwon$/);
  await page.goBack();
  await expect(page.getByLabel("Rank members by")).toHaveValue("prof-tailoring");
});

test("leaderboards look like a game's: a podium with 1st in the middle, medals, class colours; stacked on a phone", async ({ page }) => {
  await stubAll(page);
  await page.goto("/wow-forever/guild/topdeadcenter?board=honorable-kills");

  const board = page.getByRole("list", { name: "Honorable kills leaderboard" });
  const cards = board.locator("li");
  await expect(cards).toHaveCount(3);
  // Reading order stays 1st, 2nd, 2nd; screen readers hear the place.
  await expect(cards.nth(0)).toContainText("1st place");
  await expect(cards.nth(1)).toContainText("2nd place (tied)");
  const [first, second, third] = await Promise.all([0, 1, 2].map((i) => cards.nth(i).boundingBox()));
  // Wide screens: 1st stands in the middle, taller than the cards beside it.
  expect(second!.x).toBeLessThan(first!.x);
  expect(first!.x).toBeLessThan(third!.x);
  expect(first!.height).toBeGreaterThan(second!.height);
  // Each card's bar sits inside it, under the number.
  for (const [i, value] of ["112", "40", "40"].entries()) {
    const card = (await cards.nth(i).boundingBox())!;
    const bar = (await cards.nth(i).locator("span[style*='width']").boundingBox())!;
    const number = (await cards.nth(i).getByText(value, { exact: true }).boundingBox())!;
    expect(bar.y).toBeGreaterThan(number.y + number.height - 1);
    expect(bar.x).toBeGreaterThanOrEqual(card.x);
    expect(bar.x + bar.width).toBeLessThanOrEqual(card.x + card.width);
    expect(bar.y + bar.height).toBeLessThanOrEqual(card.y + card.height);
  }
  // Names wear their class colour (Tiny John is a Mage).
  const mageName = cards.nth(0).getByRole("link", { name: "Tiny John" });
  await expect(mageName).not.toHaveCSS("color", await page.locator("body").evaluate((b) => getComputedStyle(b).color));

  // Picking a category picks its first board.
  await page.getByRole("button", { name: "Reputation" }).click();
  await expect(page).toHaveURL(/board=exalted/);
  await expect(page.getByLabel("Rank members by")).toHaveValue("exalted");

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "PvP" }).click();
  const stacked = await Promise.all([0, 1, 2].map((i) => cards.nth(i).boundingBox()));
  // A phone: one column, in rank order.
  expect(stacked[0]!.y).toBeLessThan(stacked[1]!.y);
  expect(stacked[1]!.y).toBeLessThan(stacked[2]!.y);
  expect(Math.abs(stacked[0]!.x - stacked[1]!.x)).toBeLessThan(2);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // The section fits the screen (the page clips sideways overflow, so check the box), the select too.
  const section = await page.getByRole("region", { name: "Leaderboards" }).boundingBox();
  expect(section!.x + section!.width).toBeLessThanOrEqual(375);
  const select = await page.getByLabel("Rank members by").boundingBox();
  expect(select!.x + select!.width).toBeLessThanOrEqual(section!.x + section!.width);
  // On each card the name has room: it stays left of the number, on one line.
  for (const [i, value] of ["112", "40", "40"].entries()) {
    const name = await cards.nth(i).getByRole("link").boundingBox();
    const number = await cards.nth(i).getByText(value, { exact: true }).boundingBox();
    expect(name!.x + name!.width).toBeLessThanOrEqual(number!.x);
    expect(name!.height).toBeLessThanOrEqual(46);
  }
});

test("guild titles: a leader's badge by their name, every title and holder in the strip, '+N' for more, on a phone too", async ({ page }) => {
  const g = guild();
  const kb = [1, 2, 5];
  await page.route(GUILD_PATTERN, (route) =>
    json(route, { ...g, members: g.members.map((m, i) => ({ ...m, killing_blows: kb[i] })) }),
  );
  await page.route(SHEET_PATTERN, (route) => json(route, character(new URL(route.request().url()).pathname.split("/").pop() ?? "")));
  await page.goto("/wow-forever/guild/topdeadcenter");

  // The strip: Tiny John leads honorable kills (112) and killing blows; Big Sue is the only 60.
  const strip = page.getByRole("region", { name: "Guild titles" });
  await expect(strip).toContainText("Not in-game titles");
  const cards = strip.getByRole("listitem");
  await expect(cards).toHaveCount(3);
  await expect(cards.filter({ hasText: "Trailblazer" }).getByRole("link")).toHaveText("Big Sue");
  const bloodletter = cards.filter({ hasText: "Bloodletter" });
  await expect(bloodletter).toContainText("most honorable kills · 112");
  await expect(bloodletter.getByRole("link")).toHaveText("Tiny John");

  // By the name in the member table: the first title, then "+1" for the other.
  const row = page.getByRole("table").getByRole("row").filter({ hasText: "Tiny John" });
  await expect(row).toContainText("Guild title: Bloodletter (most honorable kills)");
  await expect(row.getByText("Deathblow", { exact: true })).toBeHidden();
  await row.getByRole("button", { name: "Show 1 more guild title" }).click();
  await expect(row.getByText("Deathblow", { exact: true })).toBeVisible();
  // A member with no title gets no badge.
  await expect(page.getByRole("table").getByRole("row").filter({ hasText: "Jason Kwon" })).not.toContainText("Guild title");

  await page.setViewportSize({ width: 375, height: 812 });
  const card = page.getByRole("list", { name: "Guild members" }).getByRole("listitem").filter({ hasText: "Tiny John" });
  await expect(card).toContainText("Bloodletter");
  const more = await card.getByRole("button", { name: "Show 1 more guild title" }).boundingBox();
  expect(more!.height).toBeGreaterThanOrEqual(44);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

function gainsGuild() {
  const base = guild();
  const since = (hk: number) => ({
    day: "2026-11-12", level: null, honorable_kills: hk, killing_blows: null, total_kills: null, dungeons_done: null,
  });
  return {
    ...base,
    members: [
      { ...base.members[0], baseline: since(40) },
      base.members[1],
      { ...base.members[2], baseline: since(100) },
    ],
  };
}

test("gains board: who gained what since when, who isn't ranked and why, on a phone too", async ({ page }) => {
  await stubAll(page);
  await page.route(GUILD_PATTERN, (route) => json(route, gainsGuild()));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/wow-forever/guild/topdeadcenter?me=big-sue");

  await page.getByRole("button", { name: "This week" }).click();
  await page.getByLabel("Rank members by").selectOption("honorable-kills-gained");
  await expect(page).toHaveURL(/board=honorable-kills-gained/);
  const rows = page.getByRole("list", { name: "Honorable kills gained leaderboard" }).locator("li");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Tiny John");
  await expect(rows.first()).toContainText("Mage · since Nov 12");
  await expect(rows.first()).toContainText("+12");
  await expect(page.getByText("1 member had no gain, so they're not ranked.")).toBeVisible();
  await expect(page.getByText("1 member needs a second lookup on another day to show a gain.")).toBeVisible();
  await expect(page.getByText(/Your character has no gain here yet/)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByLabel("Rank members by").selectOption("levels-gained");
  await expect(page.getByText(/No gains to show yet/)).toBeVisible();
});

function recipeSearch(query: string) {
  const known = query.toLowerCase().includes("linen");
  return {
    query,
    truncated: false,
    recipes: known
      ? [{
          id: 2963, name: "Bolt of Linen Cloth", profession_id: 197,
          crafters: [
            { slug: "jason-kwon", name: "Jason", surname: "Kwon", class_name: "Warlock", skill: 148, max_skill: 225 },
            { slug: "tiny-john", name: "Tiny", surname: "John", class_name: "Mage", skill: null, max_skill: null },
          ],
        }]
      : [],
  };
}

test("recipe search: who knows it and their skill, kept in the URL across Back", async ({ page }) => {
  await stubAll(page);
  const asked: string[] = [];
  await page.route(RECIPES_PATTERN, (route) => {
    const q = new URL(route.request().url()).searchParams.get("q") ?? "";
    asked.push(q);
    return json(route, recipeSearch(q));
  });
  await page.goto("/wow-forever/guild/topdeadcenter");

  await page.getByLabel("Recipe", { exact: true }).fill("l");
  await page.waitForTimeout(600);
  expect(asked).toEqual([]);

  await page.getByLabel("Recipe", { exact: true }).fill("linen");
  await expect(page).toHaveURL(/recipe=linen/);
  const results = page.getByRole("list", { name: "Matching recipes" });
  await expect(results).toContainText("Bolt of Linen Cloth");
  await expect(results).toContainText("Tailoring");
  await expect(page.getByText('1 recipe matching "linen"')).toBeVisible();
  const who = page.getByRole("list", { name: "Who knows Bolt of Linen Cloth" }).locator("li");
  await expect(who).toHaveCount(2);
  await expect(who.nth(0)).toContainText("Jason Kwon");
  await expect(who.nth(0)).toContainText("148 / 225");
  expect(asked).toEqual(["linen"]);

  await who.nth(1).getByRole("link", { name: "Tiny John" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/character\/tiny-john$/);
  await page.goBack();
  await expect(page).toHaveURL(/recipe=linen/);
  await expect(page.getByLabel("Recipe", { exact: true })).toHaveValue("linen");
  await expect(results).toContainText("Bolt of Linen Cloth");

  await page.getByLabel("Recipe", { exact: true }).fill("zzz");
  await expect(page.getByText(/Nobody in the guild knows a recipe matching "zzz"/)).toBeVisible();
});

test("recipe search: a problem offers a retry, and the 375px phone layout doesn't overflow", async ({ page }) => {
  await stubAll(page);
  let fail = true;
  await page.route(RECIPES_PATTERN, (route) => {
    if (fail) return json(route, { detail: "boom" }, 500);
    return json(route, recipeSearch(new URL(route.request().url()).searchParams.get("q") ?? ""));
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/wow-forever/guild/topdeadcenter?recipe=linen");

  await expect(page.getByText("Couldn't search the guild's recipes.")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: /Try again|Retry/ }).click();
  await expect(page.getByRole("list", { name: "Matching recipes" })).toContainText("Bolt of Linen Cloth");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

const REPUTATIONS_PATTERN = (url: URL) => /\/wow\/guilds\/[^/]+\/reputations$/.test(url.pathname);
const FACTIONS = [{ id: 47, name: "Ironforge", members: 3 }, { id: 72, name: "Stormwind", members: 1 }];

/** The reputations endpoint: Stormwind when asked, otherwise (default or unknown faction) Ironforge. */
function reputationsFor(url: URL) {
  if (url.searchParams.get("faction") === "72") {
    return { faction_id: 72, factions: FACTIONS, standings: [{ slug: "tiny-john", tier: 4, value: 100, max: 6000 }] };
  }
  return {
    faction_id: 47,
    factions: FACTIONS,
    standings: [
      { slug: "jason-kwon", tier: 5, value: 6550, max: 12000 },
      { slug: "big-sue", tier: 6, value: 20, max: 21000 },
      { slug: "tiny-john", tier: 5, value: 6550, max: 12000 },
    ],
  };
}

test("faction standing board: pick a faction, standings rank by tier, an old link falls back", async ({ page }) => {
  await stubAll(page);
  await page.route(REPUTATIONS_PATTERN, (route) => json(route, reputationsFor(new URL(route.request().url()))));
  await page.goto("/wow-forever/guild/topdeadcenter?board=faction&faction=999");

  // Nobody has met faction 999: the board shows the faction most members have met, and the URL says so.
  await expect(page).toHaveURL(/faction=47/);
  await expect(page.getByLabel("Faction", { exact: true })).toHaveValue("47");
  const rows = page.getByRole("list", { name: "Ironforge standing leaderboard" }).locator("li");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText(/^1.*Big Sue.*Revered/);
  await expect(rows.nth(1)).toContainText(/^2.*Jason Kwon.*6,550 \/ 12,000.*Honored/);
  await expect(rows.nth(2)).toContainText(/^2.*Tiny John/);

  await page.getByLabel("Faction", { exact: true }).selectOption("72");
  await expect(page).toHaveURL(/faction=72/);
  const stormwind = page.getByRole("list", { name: "Stormwind standing leaderboard" }).locator("li");
  await expect(stormwind).toHaveCount(1);
  await expect(stormwind.first()).toContainText("Friendly");
  await expect(page.getByText("2 members have no standing with Stormwind that we know of, so they're not ranked.")).toBeVisible();

  await stormwind.first().getByRole("link", { name: "Tiny John" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/character\/tiny-john$/);
  await page.goBack();
  await expect(page.getByLabel("Faction", { exact: true })).toHaveValue("72");

  await page.setViewportSize({ width: 375, height: 812 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("faction standing board: a problem offers a retry that brings the standings in", async ({ page }) => {
  await stubAll(page);
  let failures = 1;
  await page.route(REPUTATIONS_PATTERN, (route) => {
    if (failures-- > 0) return json(route, { detail: "boom" }, 500);
    return json(route, reputationsFor(new URL(route.request().url())));
  });
  await page.goto("/wow-forever/guild/topdeadcenter?board=faction");

  await expect(page.getByText("Couldn't load reputation standings. Check your connection and try again.")).toBeVisible();
  await expect(page.getByLabel("Rank members by")).toHaveValue("faction");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("list", { name: "Ironforge standing leaderboard" }).locator("li")).toHaveCount(3);
});

// --- the Guild menu item (/wow-forever/guild) ---------------------------------------

function guildSearch(query: string) {
  return {
    query,
    guilds: [
      { slug: "topdeadcenter", name: "TopDeadCenter", faction: "alliance", member_count: 4 },
      { slug: "dead-men-walking", name: "Dead Men Walking", faction: "horde", member_count: null },
    ],
    truncated: false,
  };
}

async function stubSearch(page: Page): Promise<string[]> {
  const queries: string[] = [];
  await page.route(SEARCH_PATTERN, (route) => {
    const q = new URL(route.request().url()).searchParams.get("q") ?? "";
    queries.push(q);
    return json(route, guildSearch(q));
  });
  return queries;
}

test("Guild menu item: search a guild by name and open it", async ({ page }) => {
  await stubAll(page);
  const queries = await stubSearch(page);
  await page.goto("/wow-forever");
  await page.getByRole("link", { name: "Guild", exact: true }).first().click();
  await expect(page).toHaveURL(/\/wow-forever\/guild$/);
  await expect(page.getByRole("heading", { name: "Find a guild" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Look up your character" })).toBeVisible();

  await page.getByRole("searchbox", { name: "Guild name" }).fill("dead");
  await expect(page).toHaveURL(/\/wow-forever\/guild\?q=dead$/);
  const results = page.getByRole("list", { name: "Matching guilds" }).getByRole("link");
  await expect(results).toHaveCount(2);
  await expect(results.first()).toContainText("TopDeadCenter");
  await expect(results.first()).toContainText("4 members");
  await expect(page.getByRole("status")).toHaveText('2 guilds matching "dead"');
  expect(queries).toEqual(["dead"]);

  await results.first().click();
  await expect(page).toHaveURL(/\/wow-forever\/guild\/topdeadcenter$/);
  await expect(page.getByRole("heading", { name: "<TopDeadCenter>" })).toBeVisible();
});

test("Guild menu item: opens your character's guild, and Find another guild gets back to the search, on a phone too", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await stubAll(page);
  await stubSearch(page);
  await page.goto("/wow-forever/character/jason-kwon");
  await expect(page.getByRole("heading", { name: "Jason Kwon" })).toBeVisible();

  await page.goto("/wow-forever/guild");
  await expect(page).toHaveURL(/\/wow-forever\/guild\/topdeadcenter$/);
  await expect(page.getByRole("heading", { name: "<TopDeadCenter>" })).toBeVisible();

  await page.getByRole("link", { name: "Find another guild" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/guild\?find=1$/);
  const yours = page.getByRole("region", { name: "Your guild" });
  await expect(yours.getByRole("link", { name: /TopDeadCenter/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Find another guild" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Guild name" }).fill("dead");
  await expect(page.getByRole("list", { name: "Matching guilds" }).getByRole("link")).toHaveCount(2);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await yours.getByRole("link").boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goBack();
  await expect(page).toHaveURL(/\/wow-forever\/guild\/topdeadcenter$/);
});
