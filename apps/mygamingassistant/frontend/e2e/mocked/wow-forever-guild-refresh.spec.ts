/**
 * WoW Forever guild page — "Refresh now" — E2E, network-stubbed.
 *
 *   - click: the button shows "Refreshing…" at once, the roster line then reads "updated just now",
 *     a success toast shows, and the button waits out the cooldown (disabled, with the minutes left)
 *   - a guild inside its cooldown on load: the button is disabled and says for how long
 *   - a failed refresh says Blizzard didn't answer, and the list stays
 *
 * Stubbed: `/wow/guilds/<slug>` (stateful: the refresh moves its roster time) and
 * `/wow/guilds/<slug>/refresh`.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-guild-refresh
 */
import { test, expect, type Page, type Route } from "@playwright/test";

const GUILD_PATTERN = (url: URL) => /\/wow\/guilds\/[^/]+$/.test(url.pathname);
const REFRESH_PATTERN = (url: URL) => /\/wow\/guilds\/[^/]+\/refresh$/.test(url.pathname);
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const COOLDOWN_SECONDS = 300;
const REFRESH_DELAY_MS = 600;

interface GuildState {
  slug: string;
  canRefresh: boolean;
  rosterUpdatedAt: string;
  refreshAvailableAt: string | null;
  failedAt: string | null;
}

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function guildBody(state: GuildState) {
  return {
    slug: state.slug,
    name: "TopDeadCenter",
    faction: "alliance",
    roster_size: 1,
    roster_updated_at: state.rosterUpdatedAt,
    refresh_failed: state.failedAt !== null,
    refresh_failed_at: state.failedAt,
    can_refresh: state.canRefresh,
    refresh_available_at: state.refreshAvailableAt,
    gone: false,
    gains_window_days: 7,
    members: [
      {
        slug: "jason-kwon", name: "Jason", surname: "Kwon", class_name: "Warlock", level: 37, item_level: 28,
        honorable_kills: 40, killing_blows: null, deaths_from_players: null, total_kills: null, total_deaths: null,
        dungeons_done: null, exalted_reputations: null, baseline: null, professions: [], rank: 0,
        refreshed_at: iso(-HOUR_MS),
      },
    ],
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function newState(overrides: Partial<GuildState> = {}): GuildState {
  return {
    slug: "topdeadcenter",
    canRefresh: true,
    rosterUpdatedAt: iso(-2 * HOUR_MS),
    refreshAvailableAt: iso(-MINUTE_MS),
    failedAt: null,
    ...overrides,
  };
}

/** The refresh endpoint moves the stored guild: a good run stamps the roster, a bad one stamps a failure. */
async function stub(page: Page, state: GuildState, outcome: "ok" | "blizzard_down" = "ok") {
  let refreshes = 0;
  await page.route(GUILD_PATTERN, (route) => json(route, guildBody(state)));
  await page.route(REFRESH_PATTERN, async (route) => {
    refreshes += 1;
    await new Promise((resolve) => setTimeout(resolve, REFRESH_DELAY_MS));
    state.refreshAvailableAt = iso(COOLDOWN_SECONDS * 1000);
    if (outcome === "ok") state.rosterUpdatedAt = iso(0);
    else state.failedAt = iso(0);
    await json(route, { status: "started", retry_after_seconds: COOLDOWN_SECONDS }, 202);
  });
  return { refreshCount: () => refreshes };
}

test("Refresh now shows loading at the click, then the roster reads just now and the button waits out the cooldown", async ({ page }) => {
  const calls = await stub(page, newState());
  await page.goto("/wow-forever/guild");
  await expect(page.getByText(/Roster updated/)).toContainText("2 hours ago");

  await page.getByRole("button", { name: "Refresh now" }).click();

  const busy = page.getByRole("button", { name: "Refreshing…" });
  await expect(busy).toBeVisible();
  await expect(busy).toBeDisabled();

  await expect(page.getByText(/Roster updated/)).toContainText("just now");
  await expect(page.getByText("Guild refreshed — the roster and members are up to date.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh now" })).toBeDisabled();
  await expect(page.getByText("Refreshed recently — you can refresh again in 5 minutes.")).toBeVisible();
  expect(calls.refreshCount()).toBe(1);
});

test("a guild refreshed a moment ago starts with the button disabled and says for how long", async ({ page }) => {
  await stub(page, newState({ refreshAvailableAt: iso(3 * MINUTE_MS - 5_000) }));
  await page.goto("/wow-forever/guild");

  await expect(page.getByRole("button", { name: "Refresh now" })).toBeDisabled();
  await expect(page.getByText("Refreshed recently — you can refresh again in 3 minutes.")).toBeVisible();
});

test("a refresh Blizzard did not answer says so and keeps the list", async ({ page }) => {
  await stub(page, newState(), "blizzard_down");
  await page.goto("/wow-forever/guild");

  await page.getByRole("button", { name: "Refresh now" }).click();

  await expect(page.getByText("Blizzard didn't answer the refresh. The list is unchanged; we'll try again soon.", { exact: true })).toBeVisible();
  await expect(page.getByRole("table").getByRole("link", { name: "Jason Kwon" })).toBeVisible();
});
