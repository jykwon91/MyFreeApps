/**
 * WoW Forever Item Compare — screenshot and pasted-text flows.
 *
 * The page is frontend-only, so no backend data is seeded. The
 * screenshot read is served by a route stub so the suite never spends a real
 * Claude call; the real endpoint is covered by the backend tests.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever
 */
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

const SETTINGS_KEY = "mga.wowForever.compare.settings.v1";
// A real 1x1 PNG, so the preview renders.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function useArmsWarrior(page: Page) {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [SETTINGS_KEY, JSON.stringify({ classId: "warrior", specId: "arms", bracket: "level60", currentHitPct: null })],
  );
}

function itemCard(page: Page, position: number) {
  return page.getByRole("article", { name: new RegExp(`^Item ${position}:`) });
}

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("the screenshot reader fills the item", async ({ page }) => {
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
  await expect(card.getByRole("radio", { name: "Search by name" })).toHaveAttribute("aria-checked", "true");
  await card.getByRole("radio", { name: "From a screenshot" }).click();
  // Ctrl+V into the box (a real paste event carrying the image).
  const box = card.getByRole("group", { name: "Add a screenshot" });
  await box.click();
  await box.evaluate((el, bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], "tooltip.png", { type: "image/png" }));
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, Array.from(PNG));
  const preview = card.getByRole("img", { name: "Screenshot to read: tooltip.png" });
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await card.getByRole("button", { name: "Read screenshot" }).click();

  const filled = page.getByRole("article", { name: /^Item 1: Strong Helm/ });
  await expect(filled).toBeVisible();
  // The screenshot stays on screen so the reading can be checked against it.
  await expect(filled.getByText("The item below was read from this screenshot.")).toBeVisible();
  await filled.getByRole("button", { name: "Use a different screenshot" }).click();
  await expect(filled.getByRole("group", { name: "Add a screenshot" })).toBeVisible();
});

test("pasted tooltips from a website are compared and a winner explained", async ({ page }) => {
  await useArmsWarrior(page);
  await page.goto("/wow-forever/compare");

  for (const [position, text] of [
    [1, "Strong Helm\n+20 Strength\n+5 Intellect"],
    [2, "Sturdy Helm\n+5 Strength\n+10 Stamina"],
  ] as const) {
    const card = itemCard(page, position);
    await card.getByRole("radio", { name: "Paste text" }).click();
    await card.getByRole("textbox", { name: /tooltip text/i }).fill(text);
    await card.getByRole("button", { name: "Read text" }).click();
  }

  await expect(page.getByRole("heading", { name: "Strong Helm is the better pick" })).toBeVisible();
  await expect(page.getByText(/ahead mostly on Strength/)).toBeVisible();
});

test("the Item compare page downloads the MGA Loot addon with its weights inside", async ({ page }) => {
  await page.goto("/wow-forever/compare");
  const card = page.getByTestId("loot-addon");
  await card.getByText("Know in game if a loot roll is an upgrade").click();
  await expect(card).toContainText(String.raw`World of Warcraft\_forever_\Interface\AddOns`);
  const [download] = await Promise.all([page.waitForEvent("download"), card.getByTestId("loot-addon-download").click()]);
  expect(download.suggestedFilename()).toBe("MGALoot.zip");
  const files = unzipSync(readFileSync(await download.path()));
  expect(Object.keys(files).sort()).toEqual(["MGALoot/", "MGALoot/Data.lua", "MGALoot/MGALoot.lua", "MGALoot/MGALoot.toc"]);
  expect(strFromU8(files["MGALoot/Data.lua"])).toContain('{id = "arms", name = "Arms", tab = 1, weights = {');
  expect(strFromU8(files["MGALoot/MGALoot.toc"])).toContain("## SavedVariables: MGALootSettings");
  await expect(page.getByText("MGA Loot is downloading. Unzip it into your AddOns folder.").first()).toBeVisible();
});
