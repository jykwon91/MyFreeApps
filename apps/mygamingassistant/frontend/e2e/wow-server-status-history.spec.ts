/**
 * WoW Forever server status page (/wow-forever/server-status) — E2E, network-stubbed.
 *
 *   - the hub links to the page
 *   - uptime history: a timeline bar per ruleset, streaks, the 24h / 7d switch (kept in the URL), outages
 *   - skeleton while the history loads, then the loaded rows in the same places
 *   - login-error search by code and words, and the #err-<id> deep link
 *   - 375px phone layout: no horizontal overflow
 *
 * Both endpoints are stubbed: `/wow/server-status` (live) and `/wow/server-status/history`.
 *
 * Run: npm run test:e2e -- wow-server-status-history
 */
import { test, expect, type Page, type Route } from "@playwright/test";

/** The live endpoint only — a glob for it would also catch `/history`. */
const LIVE_PATTERN = (url: URL) => url.pathname.endsWith("/wow/server-status");
const HISTORY_PATTERN = "**/wow/server-status/history**";

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function liveStatus() {
  return {
    region: "us",
    checked_at: hoursAgo(0),
    rulesets: [
      { name: "Normal", slug: "normal", online: true },
      { name: "PvP", slug: "pvp", online: false },
    ],
  };
}

/** Normal: up, an hour down 29 h ago, then up; PvP: up, then down for the last hour. Hourly checkpoints. */
function history() {
  return {
    region: "us",
    generated_at: hoursAgo(0),
    window_start: hoursAgo(168),
    check_interval_seconds: 300,
    max_gap_seconds: 4200,
    rulesets: [
      {
        slug: "normal",
        name: "Normal",
        since: hoursAgo(28),
        since_exact: true,
        points: Array.from({ length: 31 }, (_, i) => ({ at: hoursAgo(30 - i), status: i === 1 ? "down" : "up" })),
      },
      {
        slug: "pvp",
        name: "PvP",
        since: hoursAgo(1),
        since_exact: true,
        points: [
          ...[5, 4, 3, 2].map((h) => ({ at: hoursAgo(h), status: "up" })),
          { at: hoursAgo(1), status: "down" },
          { at: hoursAgo(0.05), status: "down" },
        ],
      },
    ],
  };
}

function json(route: Route, body: unknown) {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

async function stubApis(page: Page) {
  await page.route(LIVE_PATTERN, (route) => json(route, liveStatus()));
  await page.route(HISTORY_PATTERN, (route) => json(route, history()));
}

test("the hub links to the server status page", async ({ page }) => {
  await stubApis(page);
  await page.goto("/wow-forever");
  const section = page.getByRole("region", { name: "WoW Forever server status" });
  await section.getByRole("link", { name: "Uptime history and login error help" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/server-status$/);
  await expect(page.getByRole("heading", { level: 1, name: "Server status" })).toBeVisible();
});

test("shows uptime timelines, streaks and outages, and switches to 7 days", async ({ page }) => {
  const regions: string[] = [];
  await page.route(LIVE_PATTERN, (route) => json(route, liveStatus()));
  await page.route(HISTORY_PATTERN, (route) => {
    regions.push(new URL(route.request().url()).searchParams.get("region") ?? "");
    return json(route, history());
  });
  await page.goto("/wow-forever/server-status");

  const historySection = page.getByRole("region", { name: "Uptime history" });
  const rows = historySection.getByTestId("ruleset-history");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Normal");
  await expect(rows.nth(0)).toContainText("100% up");
  // The page's clock is read before the stub builds its times, so 28 h can show as 1 d 3 h (59 min).
  await expect(rows.nth(0)).toContainText(/Up for 1 d [34] h/);
  await expect(rows.nth(1)).toContainText(/Down since /);
  await expect(historySection.getByRole("img", { name: /^PvP: up 80% of the recorded time in the last 24 hours$/ })).toBeVisible();
  await expect(historySection.getByText(/Times are in your time zone/)).toBeVisible();

  const outages = historySection.getByRole("list", { name: "Recent outages" }).getByRole("listitem");
  await expect(outages).toHaveCount(2);
  await expect(outages.nth(0)).toContainText("PvP");
  await expect(outages.nth(0)).toContainText("Ongoing");
  await expect(outages.nth(1)).toContainText("Normal");
  await expect(outages.nth(1)).toContainText("1 h");

  await historySection.getByRole("radio", { name: "Last 7 days" }).click();
  await expect(page).toHaveURL(/\?range=7d$/);
  await expect(historySection.getByRole("img", { name: /^Normal: up 96\.6% of the recorded time in the last 7 days$/ })).toBeVisible();

  await page.reload();
  await expect(historySection.getByRole("radio", { name: "Last 7 days" })).toHaveAttribute("aria-checked", "true");

  // The history follows the saved region.
  await page.getByRole("combobox", { name: "Region" }).selectOption("eu");
  await expect.poll(() => regions).toContain("eu");
});

test("shows a skeleton while the history loads, laid out like the loaded rows", async ({ page }) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(LIVE_PATTERN, (route) => json(route, liveStatus()));
  await page.route(HISTORY_PATTERN, async (route) => {
    await held;
    await json(route, history());
  });
  await page.goto("/wow-forever/server-status");

  const historySection = page.getByRole("region", { name: "Uptime history" });
  const skeleton = historySection.getByTestId("history-skeleton");
  await expect(skeleton).toBeVisible();
  await expect(skeleton.locator("li")).toHaveCount(4); // one row per ruleset Blizzard lists
  const skeletonBar = await skeleton.locator("li").first().boundingBox();

  release();
  await expect(skeleton).toHaveCount(0);
  const rows = historySection.getByTestId("ruleset-history");
  await expect(rows).toHaveCount(2);
  const loadedBar = await rows.first().getByRole("img").boundingBox();
  expect(Math.abs((skeletonBar?.width ?? 0) - (loadedBar?.width ?? 0))).toBeLessThanOrEqual(2);
});

test("searches login errors by code and words", async ({ page }) => {
  await stubApis(page);
  await page.goto("/wow-forever/server-status");
  const help = page.getByRole("region", { name: "Can't log in?" });
  const search = help.getByRole("searchbox", { name: "Search login errors" });
  const cards = help.getByRole("list", { name: "Login errors" }).locator(":scope > li");

  await expect(cards.first()).toBeVisible();
  const total = await cards.count();
  expect(total).toBeGreaterThanOrEqual(7);

  await search.fill("51900319");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("WOW51900319");
  await expect(cards.first().getByTestId("provenance-badge")).toHaveAttribute("data-provenance", "unconfirmed");

  await search.fill("stuck transferring");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Transferring");

  await search.fill("zzqx");
  await expect(help.getByText(/No error matches that/)).toBeVisible();

  await search.fill("");
  await expect(cards).toHaveCount(total);
});

test("a #err- deep link scrolls to and highlights that error", async ({ page }) => {
  await stubApis(page);
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto("/wow-forever/server-status#err-character-not-found");

  const card = page.locator("#err-character-not-found");
  await expect(card).toHaveAttribute("data-targeted", "true");
  await expect(card).toBeInViewport();

  await page.locator("#err-blz51900003").getByRole("link", { name: "Link to this error" }).click();
  await expect(page).toHaveURL(/#err-blz51900003$/);
  await expect(page.locator("#err-blz51900003")).toHaveAttribute("data-targeted", "true");
  await expect(card).toHaveAttribute("data-targeted", "false");
});

test("375px phone layout: the page has no horizontal overflow", async ({ page }) => {
  await stubApis(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/wow-forever/server-status");
  await expect(page.getByRole("region", { name: "Uptime history" }).getByTestId("ruleset-history")).toHaveCount(2);
  await expect(page.getByRole("list", { name: "Login errors" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  for (const name of ["Uptime history", "Can't log in?"]) {
    const { scrollWidth, clientWidth } = await page
      .getByRole("region", { name })
      .evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  }
  const toggle = page.getByRole("radio", { name: "Last 7 days" });
  const box = await toggle.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});
