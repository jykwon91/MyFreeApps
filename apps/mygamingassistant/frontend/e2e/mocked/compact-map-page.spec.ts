/**
 * The CS2 map page in compact mode (?compact=1): the board without the app shell, in a
 * small second-monitor window. The frame's <main> is the page's one landmark and its
 * one scroller, so the top bar, the minimap column and the lineup list must fit it, the
 * filters must keep working inside it, and "c" must hand the shell back.
 * The map API is mocked; every other call answers 404.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts compact-map-page
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { COMPACT_NARROW_VIEWPORT, COMPACT_VIEWPORT } from "./constants/compactViewport";
import { expectCompactFrame, expectFrameScrollsTo } from "./fixtures/compactFrame";
import { MAP_PATH, MIRAGE, MIRAGE_LINEUPS, lineupsFor, stubMapBoard } from "./fixtures/mapBoard";

const COMPACT_MAP = `${MAP_PATH}?compact=1`;
/** CT lineups: the side_b ones plus the one that works from either side. */
const CT_LINEUPS = lineupsFor("side_b", null);
const SMOKE_LINEUPS = lineupsFor(null, "smoke");
const A_SITE = MIRAGE.zones.find((z) => z.slug === "a-site")!;
const A_SITE_LINEUPS = MIRAGE_LINEUPS.filter((l) => l.target_zone_id === A_SITE.id);

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
  await stubMapBoard(page);
});

test.describe("at the smallest window that shows the minimap", () => {
  test.use({ viewport: COMPACT_VIEWPORT });

  test("the top bar, the minimap and the lineup list fit the frame, which scrolls instead of the window", async ({ page }) => {
    await page.goto(COMPACT_MAP);
    const rows = page.getByRole("button", { name: /Click to expand storyboard/ });
    await expect(rows).toHaveCount(MIRAGE_LINEUPS.length);
    await expectCompactFrame(page);

    const main = page.getByRole("main");
    const frame = (await main.boundingBox())!;
    const topBar = (await page.locator("header").boundingBox())!;
    expect(topBar.x).toBe(frame.x);
    expect(topBar.width).toBe(frame.width);
    await expect(page.getByRole("button", { name: "Back to maps" })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: "Keyboard shortcuts (?)" })).toBeInViewport({ ratio: 1 });

    const minimap = page.getByRole("navigation", { name: /Zone minimap/ });
    await expect(minimap).toBeVisible();
    const map = (await minimap.boundingBox())!;
    expect(map.x).toBeGreaterThanOrEqual(frame.x);
    expect(map.x + map.width).toBeLessThanOrEqual(frame.x + frame.width);
    expect(map.y + map.height, "the whole minimap is in view without scrolling").toBeLessThanOrEqual(frame.y + frame.height);

    // The list is taller than the frame: the frame scrolls, the top bar stays pinned.
    await expectFrameScrollsTo(page, rows.last());
    expect((await page.locator("header").boundingBox())!.y).toBe(frame.y);
  });

  test("a side chip narrows the list inside the frame and keeps the page in compact mode", async ({ page }) => {
    await page.goto(COMPACT_MAP);
    const rows = page.getByRole("button", { name: /Click to expand storyboard/ });
    await expect(rows).toHaveCount(MIRAGE_LINEUPS.length);

    const ct = page.getByRole("group", { name: "Side filter" }).getByRole("button", { name: "CT", exact: true });
    await ct.click();

    await expect(rows).toHaveCount(CT_LINEUPS.length);
    await expect(ct).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: / — T side\./ })).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("side")).toBe("side_b");
    expect(new URL(page.url()).searchParams.get("compact")).toBe("1");
    await expectCompactFrame(page);
  });

  test("a utility chip narrows the list to that utility", async ({ page }) => {
    await page.goto(COMPACT_MAP);
    const rows = page.getByRole("button", { name: /Click to expand storyboard/ });
    await expect(rows).toHaveCount(MIRAGE_LINEUPS.length);

    await page.getByRole("group", { name: "Utility type filter" }).getByRole("button", { name: "Smoke" }).click();

    await expect(rows).toHaveCount(SMOKE_LINEUPS.length);
    await expect(page.getByRole("button", { name: /— Smoke — .*Click to expand/ })).toHaveCount(SMOKE_LINEUPS.length);
    await expectCompactFrame(page);
  });

  test("clicking a zone on the minimap filters to it, and its chip clears the filter", async ({ page }) => {
    // Pins off: the lineup pins sit over the zone polygons on the minimap and would take the click.
    await page.goto(`${COMPACT_MAP}&pins=off`);
    const rows = page.getByRole("button", { name: /Click to expand storyboard/ });
    await expect(rows).toHaveCount(MIRAGE_LINEUPS.length);

    await page.getByLabel(`${A_SITE.name} — ${A_SITE_LINEUPS.length} lineups — click to filter`).click();

    await expect(rows).toHaveCount(A_SITE_LINEUPS.length);
    await expect(page.getByRole("button", { name: /^A Site from .*Click to expand/ })).toHaveCount(A_SITE_LINEUPS.length);
    const clear = page.getByRole("button", { name: "Clear zone filter (currently A Site)" });
    await expect(clear).toBeVisible();
    await expectCompactFrame(page);

    await clear.click();
    await expect(rows).toHaveCount(MIRAGE_LINEUPS.length);
  });

  test("expanding a row opens its storyboard inside the frame without overflow", async ({ page }) => {
    await page.goto(COMPACT_MAP);
    const row = page.getByRole("button", { name: /^Mid from T Spawn — Smoke/ });
    await row.click();
    await expect(row).toHaveAttribute("aria-expanded", "true");
    const frame = (await page.getByRole("main").boundingBox())!;
    for (const pane of ["STAND", "AIM"]) {
      const box = (await page.getByText(pane, { exact: true }).boundingBox())!;
      expect(box.x, `${pane} pane starts inside the frame`).toBeGreaterThanOrEqual(frame.x);
      expect(box.x + box.width, `${pane} pane ends inside the frame`).toBeLessThanOrEqual(frame.x + frame.width);
    }
    await expectCompactFrame(page);

    await row.click();
    await expect(row).toHaveAttribute("aria-expanded", "false");
  });

  test("grid view keeps the storyboard tiles inside the frame", async ({ page }) => {
    await page.goto(COMPACT_MAP);
    await expect(page.getByRole("button", { name: /Click to expand storyboard/ })).toHaveCount(MIRAGE_LINEUPS.length);

    await page.getByRole("button", { name: /^Grid view/ }).click();

    await expect(page.getByRole("button", { name: /^Grid view/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: /Click to expand storyboard/ })).toHaveCount(0);
    await expect(page.getByRole("article")).toHaveCount(MIRAGE_LINEUPS.length);
    expect(new URL(page.url()).searchParams.get("view")).toBe("grid");
    await expectCompactFrame(page);
  });

  test("the c key leaves compact mode and brings the shell back", async ({ page }) => {
    await page.goto(COMPACT_MAP);
    await expect(page.getByRole("button", { name: /Click to expand storyboard/ })).toHaveCount(MIRAGE_LINEUPS.length);
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);

    await page.keyboard.press("c");

    await expect(page.getByRole("navigation", { name: "Main navigation" }).first()).toBeVisible();
    expect(new URL(page.url()).searchParams.has("compact")).toBe(false);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /Click to expand storyboard/ })).toHaveCount(MIRAGE_LINEUPS.length);
  });
});

test.describe("in a narrow window", () => {
  test.use({ viewport: COMPACT_NARROW_VIEWPORT });

  test("the minimap column gives way and the top bar scrolls on its own so every control stays reachable", async ({ page }) => {
    await page.goto(COMPACT_MAP);
    await expect(page.getByRole("button", { name: /Click to expand storyboard/ })).toHaveCount(MIRAGE_LINEUPS.length);
    await expect(page.getByRole("navigation", { name: /Zone minimap/ })).toBeHidden();
    await expectCompactFrame(page);

    const topBar = page.locator("header");
    const bar = await topBar.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(bar.scrollWidth, "the bar is wider than the window, so it scrolls").toBeGreaterThan(bar.clientWidth);

    const help = page.getByRole("button", { name: "Keyboard shortcuts (?)" });
    await help.scrollIntoViewIfNeeded();
    await expect(help).toBeInViewport({ ratio: 1 });
    await help.click();
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    await expectCompactFrame(page);
  });
});
