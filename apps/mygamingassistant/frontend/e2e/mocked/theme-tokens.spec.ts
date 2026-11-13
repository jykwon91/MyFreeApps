/**
 * The design tokens are Tailwind theme colors, so every token utility renders, in light and dark:
 * the variant and opacity forms (`ring-primary`, `border-l-primary`, `bg-primary/10`) as well as
 * the plain ones. Before src/index.css registered them with `@theme inline`, only a hand-written
 * dozen existed and these were silent no-ops: the active round-mode card had no primary ring
 * and the row open in the pin editor had no accent bar.
 *
 * Opacity forms of a text colour are live too, so text must stay readable (4.5:1) where it is
 * painted, and a focus ring must stand out (3:1) from what it is drawn on.
 *
 * Each colour check compares the rendered colour with the token itself, resolved on the same
 * element, so it follows the `.dark` overrides.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts theme-tokens
 */
import type { Locator } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubSignedInShell, stubUnmatchedApi, TEST_USER } from "@platform/ui/test-support/mockSession";
import type { PinEntry } from "@/hooks/usePins";
import { COLOR_SCHEMES } from "./constants/colorSchemes";
import { WCAG_CONTRAST } from "./constants/wcagContrast";
import { expectColorScheme } from "./fixtures/colorScheme";
import { paintedContrast } from "./fixtures/contrast";
import { GAME_SLUG, MAP_PATH, MAP_SLUG, MIRAGE_LINEUPS, stubMapBoard } from "./fixtures/mapBoard";

const LINEUP = MIRAGE_LINEUPS[0]!;

/** `hsl(var(--primary))` as the browser computes it under `el` (an `rgb(...)` string). */
async function primaryAt(el: Locator): Promise<string> {
  return el.evaluate((node) => {
    const probe = document.createElement("span");
    probe.style.color = "hsl(var(--primary))";
    node.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
}

async function expectReadable(text: Locator): Promise<void> {
  await expect(text).toBeVisible();
  expect((await paintedContrast(text)).text).toBeGreaterThanOrEqual(WCAG_CONTRAST.TEXT);
}

for (const scheme of COLOR_SCHEMES) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("the active round-mode card is ringed in the primary colour", async ({ page }) => {
      await stubUnmatchedApi(page);
      await stubMapBoard(page);
      // Round mode with no side filter keeps its pins under the "any" side.
      await page.addInitScript(
        ({ key, entries }) => window.localStorage.setItem(key, JSON.stringify(entries)),
        { key: `mga.pins.${GAME_SLUG}.${MAP_SLUG}.any`, entries: [{ lineup_id: LINEUP.id, sort_order: 0 } satisfies PinEntry] },
      );

      await page.goto(`${MAP_PATH}?round=1`);
      await expectColorScheme(page, scheme);
      const activeCard = page.locator('[aria-current="true"]');
      await expect(activeCard.getByRole("heading", { name: LINEUP.title!, level: 3 })).toBeVisible();

      const primary = await primaryAt(activeCard);
      const boxShadow = await activeCard.evaluate((el) => getComputedStyle(el).boxShadow);
      expect(boxShadow).toContain(`${primary} 0px 0px 0px 2px`);

      // The utility chip is tinted with the primary colour, not left transparent.
      const chip = activeCard.getByText("Smoke", { exact: true });
      expect(await chip.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");

      // The side-tinted page background is a valid colour, not dropped for an invalid color-mix().
      const roundMode = page.getByTestId("round-mode");
      expect(await roundMode.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    });

    test("the lineup list's muted text is readable", async ({ page }) => {
      await stubUnmatchedApi(page);
      await stubMapBoard(page);

      await page.goto(MAP_PATH);
      await expectColorScheme(page, scheme);
      const zoneCount = MIRAGE_LINEUPS.filter((l) => l.target_zone_id === LINEUP.target_zone_id).length;
      await expectReadable(page.getByRole("heading", { level: 2, name: /A Site/ }).getByText(`(${zoneCount})`, { exact: true }));
      await expectReadable(page.getByText(`· ${LINEUP.technique}`, { exact: true }).first());
    });

    test("the lineup open in the pin editor has a primary accent bar and readable text", async ({ page }) => {
      await stubSignedInShell(page, { user: { ...TEST_USER, is_superuser: true } });
      await stubMapBoard(page);

      await page.goto(`${MAP_PATH}?edit=${LINEUP.id}`);
      await expectColorScheme(page, scheme);
      const row = page.locator("[data-editing]");
      const rowButton = row.getByRole("button", { name: /Currently open in the pin editor/ });
      await expect(rowButton).toBeVisible();

      const primary = await primaryAt(row);
      const bar = await row.evaluate((el) => {
        const s = getComputedStyle(el);
        return { width: s.borderLeftWidth, color: s.borderLeftColor };
      });
      expect(bar.width).toBe("4px");
      expect(bar.color).toBe(primary);

      await expectReadable(rowButton.getByText(`· ${LINEUP.technique}`, { exact: true }));
    });

    test("a focused field's ring stands out from the card it sits on", async ({ page }) => {
      await stubUnmatchedApi(page);
      await page.goto("/wow-forever/character");
      await expectColorScheme(page, scheme);
      const field = page.getByLabel("Character name (first name and surname)");
      await field.focus();

      const { ring } = await paintedContrast(field);
      expect(ring, "the field has a focus ring").not.toBeNull();
      expect(ring!).toBeGreaterThanOrEqual(WCAG_CONTRAST.NON_TEXT);
    });
  });
}
