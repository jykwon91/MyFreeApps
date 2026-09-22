/**
 * WoW Forever Item Compare — screenshot and pasted-text flows.
 *
 * The page is frontend-only, so no backend data is seeded. The
 * screenshot read is served by a route stub so the suite never spends a real
 * Claude call; the real endpoint is covered by the backend tests.
 *
 * Run: npm run test:e2e -- wow-forever
 */
import { test, expect, type Page } from "@playwright/test";

const SETTINGS_KEY = "mga.wowForever.compare.settings.v1";
// Smallest valid PNG header — the stubbed endpoint never decodes it.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function useArmsWarrior(page: Page) {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [SETTINGS_KEY, JSON.stringify({ classId: "warrior", specId: "arms", bracket: "level60", currentHitPct: null })],
  );
}

function itemCard(page: Page, position: number) {
  return page.getByRole("article", { name: new RegExp(`^Item ${position}:`) });
}

test("items open on the screenshot reader and a read fills the item", async ({ page }) => {
  await useArmsWarrior(page);
  await page.route("**/wow/items/extract", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        item: {
          name: "Strong Helm",
          quality: null,
          slot: null,
          item_type: null,
          armor: null,
          weapon: null,
          stats: { strength: 20 },
          unparsed_effects: [],
          required_level: null,
          set_name: null,
        },
        warnings: [],
      }),
    }),
  );
  await page.goto("/wow-forever/compare");

  const card = itemCard(page, 1);
  await expect(card.getByRole("radio", { name: "Screenshot" })).toHaveAttribute("aria-checked", "true");
  await card.locator('input[type="file"]').setInputFiles({ name: "tooltip.png", mimeType: "image/png", buffer: PNG });
  await card.getByRole("button", { name: "Read screenshot" }).click();

  await expect(page.getByRole("article", { name: /^Item 1: Strong Helm/ })).toBeVisible();
});

test("pasted tooltips from a website are compared and a winner explained", async ({ page }) => {
  await useArmsWarrior(page);
  await page.goto("/wow-forever/compare");

  for (const [position, text] of [
    [1, "Strong Helm\n+20 Strength\n+5 Intellect"],
    [2, "Sturdy Helm\n+5 Strength\n+10 Stamina"],
  ] as const) {
    const card = itemCard(page, position);
    await card.getByRole("radio", { name: "Paste from a website" }).click();
    await card.getByRole("textbox", { name: /tooltip text/i }).fill(text);
    await card.getByRole("button", { name: "Read text" }).click();
  }

  await expect(page.getByRole("heading", { name: "Strong Helm is the better pick" })).toBeVisible();
  await expect(page.getByText(/ahead mostly on Strength/)).toBeVisible();
});
