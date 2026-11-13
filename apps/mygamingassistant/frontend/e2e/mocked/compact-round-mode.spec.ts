/**
 * Round mode (?round=1) in compact mode (?compact=1): the pinned lineups as large cards in the
 * shell-less second-monitor window. The frame's <main> is the page's one landmark and its one
 * scroller, so the status strip and the cards must fit it; the arrow keys must move the active
 * card, a card's pin button must drop it, and exiting must stay in the compact frame.
 * Pins live in localStorage (seeded per test); the map API is mocked, every other call answers 404.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts compact-round-mode
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import type { PinEntry } from "@/hooks/usePins";
import { COMPACT_NARROW_VIEWPORT, COMPACT_VIEWPORT } from "./constants/compactViewport";
import { expectCompactFrame, expectFrameScrollsTo } from "./fixtures/compactFrame";
import { GAME_SLUG, MAP_PATH, MAP_SLUG, MIRAGE_LINEUPS, stubMapBoard } from "./fixtures/mapBoard";

const COMPACT_ROUND = `${MAP_PATH}?compact=1&round=1`;
/** Round mode with no side filter keeps its pins under the "any" side. */
const PINS_KEY = `mga.pins.${GAME_SLUG}.${MAP_SLUG}.any`;
const PINNED = MIRAGE_LINEUPS.slice(0, 4);

async function seedPins(page: Page, ids: string[]): Promise<void> {
  await page.addInitScript(
    ({ key, entries }) => window.localStorage.setItem(key, JSON.stringify(entries)),
    { key: PINS_KEY, entries: ids.map((id, order): PinEntry => ({ lineup_id: id, sort_order: order })) },
  );
}

/** Where each card sits in the grid, in heading order. offsetTop/offsetLeft ignore the active card's 1% scale. */
function cardOffsets(page: Page): Promise<{ top: number; left: number }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("h3")].map((heading) => {
      const card = heading.closest<HTMLElement>(".grid > *")!;
      return { top: card.offsetTop, left: card.offsetLeft };
    }),
  );
}

function storedPins(page: Page): Promise<string[]> {
  return page.evaluate((key) => {
    const entries: Pick<PinEntry, "lineup_id">[] = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return entries.map((e) => e.lineup_id);
  }, PINS_KEY);
}

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
  await stubMapBoard(page);
});

test.describe("with pinned lineups", () => {
  test.beforeEach(async ({ page }) => {
    await seedPins(page, PINNED.map((l) => l.id));
  });

  test.describe("at the smallest window that shows the minimap", () => {
    test.use({ viewport: COMPACT_VIEWPORT });

    test("the status strip and two columns of cards fit the frame, which scrolls instead of the window", async ({ page }) => {
      await page.goto(COMPACT_ROUND);
      const cards = page.getByRole("heading", { level: 3 });
      await expect(cards).toHaveCount(PINNED.length);
      await expectCompactFrame(page);
      await expect(page.getByText("Counter-Strike 2")).toBeVisible();
      await expect(page.getByRole("link", { name: "Exit round mode" })).toBeInViewport({ ratio: 1 });

      // Two columns: the first two cards share a row, the third starts the next.
      const [first, second, third] = await cardOffsets(page);
      expect(second!.top).toBe(first!.top);
      expect(second!.left).toBeGreaterThan(first!.left);
      expect(third!.top).toBeGreaterThan(first!.top);

      // The cards are taller than the frame: the frame scrolls, the strip stays pinned.
      await expectFrameScrollsTo(page, cards.last());
      await expect(page.getByRole("link", { name: "Exit round mode" })).toBeInViewport({ ratio: 1 });
    });

    test("the arrow keys move the active card around the pinned set", async ({ page }) => {
      await page.goto(COMPACT_ROUND);
      const active = page.locator('[aria-current="true"]');
      await expect(active).toHaveCount(1);
      await expect(active.getByRole("heading", { level: 3 })).toHaveText(PINNED[0]!.title);

      await page.keyboard.press("ArrowRight");
      await expect(active.getByRole("heading", { level: 3 })).toHaveText(PINNED[1]!.title);

      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
      await expect(active.getByRole("heading", { level: 3 })).toHaveText(PINNED[PINNED.length - 1]!.title);
      await expectCompactFrame(page);
    });

    test("unpinning a card drops it from the round and from storage", async ({ page }) => {
      await page.goto(COMPACT_ROUND);
      const cards = page.getByRole("heading", { level: 3 });
      await expect(cards).toHaveCount(PINNED.length);

      const doomed = PINNED[1]!;
      await page
        .getByRole("heading", { level: 3, name: doomed.title })
        .locator("xpath=ancestor::div[.//button[@aria-label='Unpin lineup']][1]")
        .getByRole("button", { name: "Unpin lineup" })
        .click();

      await expect(cards).toHaveCount(PINNED.length - 1);
      await expect(page.getByRole("heading", { level: 3, name: doomed.title })).toHaveCount(0);
      expect(await storedPins(page)).toEqual(PINNED.filter((l) => l.id !== doomed.id).map((l) => l.id));
      await expectCompactFrame(page);
    });

    test("Exit round mode returns to the board and stays in the compact frame", async ({ page }) => {
      await page.goto(COMPACT_ROUND);
      await page.getByRole("link", { name: "Exit round mode" }).click();

      await expect(page.getByRole("button", { name: /Click to expand storyboard/ })).toHaveCount(MIRAGE_LINEUPS.length);
      const params = new URL(page.url()).searchParams;
      expect(params.has("round")).toBe(false);
      expect(params.get("compact")).toBe("1");
      await expectCompactFrame(page);
    });

    test("the p key toggles round mode from the board", async ({ page }) => {
      await page.goto(`${MAP_PATH}?compact=1`);
      await expect(page.getByRole("button", { name: /Click to expand storyboard/ })).toHaveCount(MIRAGE_LINEUPS.length);

      await page.keyboard.press("p");

      await expect(page.getByRole("heading", { level: 3 })).toHaveCount(PINNED.length);
      await expect(page.getByRole("link", { name: "Exit round mode" })).toBeVisible();
      await expectCompactFrame(page);
    });
  });

  test.describe("in a narrow window", () => {
    test.use({ viewport: COMPACT_NARROW_VIEWPORT });

    test("the cards stack in one column inside the frame", async ({ page }) => {
      await page.goto(COMPACT_ROUND);
      const cards = page.getByRole("heading", { level: 3 });
      await expect(cards).toHaveCount(PINNED.length);
      await expectCompactFrame(page);

      const [first, second] = await cardOffsets(page);
      expect(second!.top).toBeGreaterThan(first!.top);
      expect(second!.left).toBe(first!.left);
      await expect(page.getByRole("link", { name: "Exit round mode" })).toBeInViewport({ ratio: 1 });
    });
  });
});

test.describe("with nothing pinned", () => {
  test.use({ viewport: COMPACT_VIEWPORT });

  test("the empty state fits the frame and its link opens the board in the compact frame", async ({ page }) => {
    await page.goto(COMPACT_ROUND);
    const link = page.getByRole("link", { name: "Open plan mode to pin some." });
    await expect(page.getByText("No pins yet.")).toBeVisible();
    await expectCompactFrame(page);

    await link.click();

    await expect(page.getByRole("button", { name: /Click to expand storyboard/ })).toHaveCount(MIRAGE_LINEUPS.length);
    const params = new URL(page.url()).searchParams;
    expect(params.has("round")).toBe(false);
    expect(params.get("compact")).toBe("1");
    await expectCompactFrame(page);
  });
});
