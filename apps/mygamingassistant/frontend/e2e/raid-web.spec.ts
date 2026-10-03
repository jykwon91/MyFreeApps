/**
 * The raid web page — `/wow-forever/raids/:webId`, opened from [Web view] on a raid's Discord post.
 *
 * No backend: each test routes its raid (`fixtures/raidPage.ts` — the read is a fixture, the icons and banner are
 * the bot's own files), acts on the page, checks what it shows, and drops its routes.
 *
 * Run: npm run test:e2e -- raid-web
 */
import { expect, test, type Page } from "@playwright/test";
import {
  DISCORD_URL,
  RAID_PATH,
  RAID_TITLE,
  emptyRaidFixture,
  fulfillJson,
  raidFixture,
  routeRaid,
} from "./fixtures/raidPage";

const SITE_TITLE = "MyGamingAssistant";

test.afterEach(async ({ page, context }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await context.unrouteAll({ behavior: "ignoreErrors" });
});

async function openRaid(page: Page): Promise<void> {
  await page.goto(RAID_PATH);
  await expect(page.getByRole("heading", { level: 1, name: RAID_TITLE })).toBeVisible();
}

/** Whether `img` loaded a real picture, scrolling it into view first (the row icons load lazily). */
async function loaded(page: Page, alt: string): Promise<void> {
  const img = page.getByRole("img", { name: alt, exact: true }).first();
  await img.scrollIntoViewIfNeeded();
  await expect.poll(() => img.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
}

test("shows the raid as its Discord post does, and Refresh re-reads it", async ({ page }) => {
  const raid = raidFixture();
  const routes = await routeRaid(page, (route) => fulfillJson(route, 200, raid));
  await openRaid(page);

  await expect(page).toHaveTitle(`${RAID_TITLE} · ${SITE_TITLE}`);
  await expect(page.getByText("Molten Core · Leader: Aldren")).toBeVisible();
  await expect(page.getByText("40/40 confirmed (2 late) · 2 in queue")).toBeVisible();
  await expect(page.getByText("Open", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Sign-ups close/)).toBeVisible();
  await expect(page.getByRole("link", { name: /^Open in Discord/ })).toHaveAttribute("href", DISCORD_URL);
  await expect(page.getByRole("list", { name: "Roles" }).getByRole("listitem")).toHaveText([
    /Tanks\s*3\/4/,
    /Melee\s*11/,
    /Ranged\s*16/,
    /Healers\s*10\/10/,
  ]);
  // Every column with anyone in it, in the post's order, then the lists.
  await expect(page.getByRole("heading", { level: 3 })).toHaveText([
    /^Tanks\s*3\/4$/,
    /^Warrior\s*5$/,
    /^Druid\s*3$/,
    /^Paladin\s*4$/,
    /^Rogue\s*5$/,
    /^Hunter\s*4$/,
    /^Mage\s*6\/6$/,
    /^Warlock\s*4$/,
    /^Priest\s*5$/,
    /^Shaman\s*2$/,
    /^No class yet\s*1$/,
    /^Tentative\s*2$/,
    /^Bench\s*1$/,
    /^Absence\s*1$/,
  ]);
  await expect(page.getByTitle("Late")).toHaveCount(2);
  await expect(page.getByText("queued", { exact: true })).toHaveCount(2);
  const about = page.getByRole("region", { name: "About this raid" });
  await expect(about.getByText("@Raid Leads")).toBeVisible();
  await expect(about).not.toContainText("<t:");
  const banner = page.locator('img[src*="raid-banners"]');
  await expect.poll(() => banner.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await loaded(page, "Fury Warrior");
  await loaded(page, "Holy Priest");

  const before = routes.reads();
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect.poll(routes.reads).toBe(before + 1);
  await expect(page.getByText("Updated just now")).toBeVisible();
});

test("a link to no raid says so, and leads back to WoW Forever", async ({ page }) => {
  await routeRaid(page, (route) => fulfillJson(route, 404, { detail: "raid_not_found" }));
  await page.goto(RAID_PATH);
  await expect(page.getByRole("heading", { level: 1, name: "Raid not found" })).toBeVisible();
  await expect(page).toHaveTitle(`Raid not found · ${SITE_TITLE}`);

  await page.getByRole("link", { name: "Go to WoW Forever" }).click();
  await expect(page).toHaveURL(/\/wow-forever$/);
  await expect(page).toHaveTitle(SITE_TITLE);
});

test("too many requests says so, and Retry loads the raid", async ({ page }) => {
  const raid = raidFixture();
  await routeRaid(page, (route, read) => {
    if (read === 1) return fulfillJson(route, 429, { detail: "rate_limited" });
    return fulfillJson(route, 200, raid);
  });
  await page.goto(RAID_PATH);
  await expect(page.getByRole("alert")).toHaveText("Too many requests — try again in a minute.");

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("heading", { level: 1, name: RAID_TITLE })).toBeVisible();
});

test("with no sign-ups yet, it sends raiders to the post in Discord", async ({ page, context }) => {
  await context.route("https://discord.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Discord</title>" }),
  );
  await routeRaid(page, (route) => fulfillJson(route, 200, emptyRaidFixture()));
  await openRaid(page);
  await expect(page.getByText("No sign-ups yet — sign up from the raid's post in Discord.")).toBeVisible();
  await expect(page.getByText("0/40 confirmed", { exact: true })).toBeVisible();
  const links = page.getByRole("link", { name: /^Open in Discord/ });
  await expect(links).toHaveCount(2);

  const opened = context.waitForEvent("page");
  await links.last().click();
  const discord = await opened;
  await expect(discord).toHaveURL(DISCORD_URL);
  await discord.close();
});

test("on a phone it never scrolls sideways, and Refresh is a tap away", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const routes = await routeRaid(page, (route) => fulfillJson(route, 200, raidFixture()));
  await openRaid(page);
  await page.getByRole("heading", { level: 2, name: "Tentative · Bench · Absence" }).scrollIntoViewIfNeeded();

  // The window, the shell's scrolling <main> and the page's own.
  const overflow = await page.evaluate(() => {
    const mains = Array.from(document.querySelectorAll("main"));
    const inside = Math.max(0, ...mains.map((main) => main.scrollWidth - main.clientWidth));
    return Math.max(document.documentElement.scrollWidth - window.innerWidth, inside);
  });
  expect(overflow).toBeLessThanOrEqual(0);

  // At the foot of the page: a 44 px target, and a tap re-reads the raid.
  const refresh = page.getByRole("button", { name: "Refresh" });
  await refresh.scrollIntoViewIfNeeded();
  const box = await refresh.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await refresh.click();
  await expect.poll(routes.reads).toBe(2);
  await expect(page.getByText("Updated just now")).toBeVisible();

  // The whole page in one picture, to look at: the app scrolls inside its shell, not the window.
  await page.setViewportSize({ width: 375, height: 3200 });
  await page.locator("main").first().evaluate((shell) => shell.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("raid-375.png") });
});

test.describe("in the dark theme", () => {
  test.use({ colorScheme: "dark" });

  test("follows the system's dark theme", async ({ page }, testInfo) => {
    const routes = await routeRaid(page, (route) => fulfillJson(route, 200, raidFixture()));
    await openRaid(page);
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);

    await page.getByRole("button", { name: "Refresh" }).click();
    await expect.poll(routes.reads).toBe(2);
    await page.setViewportSize({ width: 1280, height: 2000 });
    await page.screenshot({ path: testInfo.outputPath("raid-dark.png") });
  });
});
