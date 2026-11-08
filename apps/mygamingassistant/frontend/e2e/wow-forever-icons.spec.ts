/**
 * In-game icons next to item / spell names on the Professions guides, the placeholder
 * when an icon can't load, and the Blizzard notice under every WoW Forever page.
 *
 * Icons come from `/api/wow/icons/{build}/{fileDataId}.webp`; here they are stubbed with
 * a real 1x1 WebP so the run needs no backend or object storage.
 *
 * Run: npm run test:e2e -- wow-forever-icons
 */
import { test, expect, type Page } from "@playwright/test";

// A valid 1x1 lossless WebP.
const WEBP_1X1 = Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64");
const ICON_URL = /\/api\/wow\/icons\/\d+\.\d+\.\d+\.\d+\/\d+\.webp$/;

async function stubPrices(page: Page): Promise<void> {
  await page.route("**/wow/prices**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        region: "us",
        credit: { source: "tsm", name: "TradeSkillMaster", url: "https://www.tradeskillmaster.com" },
        source_updated_at: null,
        fetched_at: null,
        columns: ["item_id", "market_value", "avg_sale_price", "historical", "sold_per_day", "name"],
        items: [],
      }),
    }),
  );
}

async function serveIcons(page: Page, requested: string[]): Promise<void> {
  await page.route("**/api/wow/icons/**", (route) => {
    requested.push(new URL(route.request().url()).pathname);
    return route.fulfill({
      status: 200,
      contentType: "image/webp",
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
      body: WEBP_1X1,
    });
  });
}

test.beforeEach(async ({ page }) => {
  await stubPrices(page);
});

test("a crafting route shows each recipe's and material's icon from the build-pinned URL", async ({ page }) => {
  const requested: string[] = [];
  await serveIcons(page, requested);
  await page.goto("/wow-forever/professions?p=tailoring&skill=1");

  const firstRow = page.locator("li[id^='craft-']").first();
  await expect(firstRow).toBeVisible();
  // Recipe icon (24px) + at least one material icon (16px), all decorative next to the printed name.
  const rowIcons = firstRow.getByTestId("game-icon");
  await expect(rowIcons.first()).toBeVisible();
  expect(await rowIcons.count()).toBeGreaterThanOrEqual(2);
  await expect(rowIcons.first()).toHaveAttribute("alt", "");
  await expect(rowIcons.first()).toHaveAttribute("src", ICON_URL);
  // The image really decoded (not a broken-image box).
  await expect.poll(() => rowIcons.first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  await expect(page.getByTestId("game-icon-placeholder")).toHaveCount(0);
  expect(requested.length).toBeGreaterThan(0);
  expect(requested.every((p) => ICON_URL.test(p))).toBe(true);
});

test("an icon that fails to load becomes a same-size placeholder, and the name still reads", async ({ page }) => {
  await page.route("**/api/wow/icons/**", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/wow-forever/professions?p=tailoring&skill=1");

  const firstRow = page.locator("li[id^='craft-']").first();
  const placeholder = firstRow.getByTestId("game-icon-placeholder").first();
  await expect(placeholder).toBeVisible();
  const box = await placeholder.boundingBox();
  expect(box?.width).toBeCloseTo(24, 0);
  expect(box?.height).toBeCloseTo(24, 0);
  await expect(firstRow.getByTestId("game-icon")).toHaveCount(0);
  await expect(firstRow).toContainText("Linen");
});

test("the gathering guide shows each node's item icon", async ({ page }) => {
  await serveIcons(page, []);
  await page.goto("/wow-forever/professions?p=mining&skill=1");
  const now = page.getByTestId("gather-now");
  await expect(now.getByTestId("game-icon").first()).toBeVisible();
  await expect(now).toContainText("Next unlock: Tin at 65");

  await page.getByText("Every ore and its skill").click();
  const table = page.getByTestId("node-table");
  await expect(table.getByTestId("game-icon").first()).toBeVisible();
});

test("the Blizzard notice sits once under WoW Forever pages", async ({ page }) => {
  await serveIcons(page, []);
  for (const path of ["/wow-forever", "/wow-forever/professions?p=tailoring", "/wow-forever/suggest"]) {
    await page.goto(path);
    const notice = page.getByTestId("wow-legal-notice");
    await expect(notice).toHaveCount(1);
    await expect(notice).toContainText("Not affiliated with or endorsed by Blizzard.");
  }
});

test("icons never push the phone layout sideways", async ({ page }) => {
  await serveIcons(page, []);
  await page.setViewportSize({ width: 375, height: 800 });
  for (const path of [
    "/wow-forever/professions?p=tailoring&skill=1",
    "/wow-forever/professions?p=enchanting&skill=1",
    "/wow-forever/professions?p=mining&skill=150",
  ]) {
    await page.goto(path);
    // Some icons sit in collapsed sections (shopping list, prices); wait for one on screen.
    await expect(page.locator("[data-testid='game-icon']:visible").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
