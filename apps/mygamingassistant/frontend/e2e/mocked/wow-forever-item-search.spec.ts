/**
 * WoW Forever Item Compare — "Search by name" against the real generated
 * item list (a same-origin static file; no backend, nothing stored).
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-item-search
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

const SETTINGS_KEY = "mga.wowForever.compare.settings.v1";
const ITEM_LIST = "**/items*.json";

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

test("search, pick, edit and reset an item from the game files", async ({ page }) => {
  await useArmsWarrior(page);
  await page.goto("/wow-forever/compare");

  const card = itemCard(page, 1);
  await expect(card.getByRole("radio", { name: "Search by name" })).toHaveAttribute("aria-checked", "true");
  const box = card.getByRole("combobox", { name: "Item name" });
  // Any word order; the start of a word is enough.
  await box.fill("helm lionh");
  await card.getByRole("option", { name: /Lionheart Helm/ }).first().click();

  const picked = page.getByRole("article", { name: /^Item 1: Lionheart Helm/ });
  await expect(picked.getByRole("button", { name: "Change item" })).toBeFocused();
  await expect(picked.getByText("From the Forever game files", { exact: true })).toBeVisible();
  const armor = picked.getByRole("spinbutton", { name: "Armor" });
  await expect(armor).toHaveValue("565");

  await armor.fill("600");
  await expect(picked.getByText("From the Forever game files, edited by you")).toBeVisible();
  await expect(picked.getByText("Edited, game files say 565 armor")).toBeAttached();

  await picked.getByRole("button", { name: "Reset to game-file values" }).click();
  await expect(armor).toHaveValue("565");
  await expect(picked.getByText("From the Forever game files", { exact: true })).toBeVisible();

  // A second card from the game files, then the comparison scores both.
  const second = itemCard(page, 2);
  await second.getByRole("combobox", { name: "Item name" }).fill("dark iron plate");
  await second.getByRole("option", { name: /Dark Iron Plate/ }).first().click();
  await expect(page.getByRole("heading", { name: /is the better pick/ })).toBeVisible();
  await expect(page.getByText(/Item data from the WoW Forever client via wago\.tools/)).toBeVisible();
});

test("the search box works while the item list loads", async ({ page }) => {
  await useArmsWarrior(page);
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(ITEM_LIST, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/wow-forever/compare");

  const card = itemCard(page, 1);
  await expect(card.getByTestId("item-search-skeleton")).toBeVisible();
  await expect(card.getByText("Loading item list…")).toBeAttached();
  await card.getByRole("combobox", { name: "Item name" }).fill("lionheart");
  release();
  await expect(card.getByRole("option", { name: /Lionheart Helm/ }).first()).toBeVisible();
  await expect(card.getByTestId("item-search-skeleton")).toHaveCount(0);
});

test("a failed item list load can be retried in place", async ({ page }) => {
  await useArmsWarrior(page);
  let failing = true;
  await page.route(ITEM_LIST, (route) => (failing ? route.abort() : route.continue()));
  await page.goto("/wow-forever/compare");

  const card = itemCard(page, 1);
  await expect(card.getByText("Couldn't load the item list. Check your connection and try again.")).toBeVisible();
  await expect(card.getByRole("button", { name: "paste its text" })).toBeVisible();

  failing = false;
  await card.getByRole("button", { name: "Try again" }).click();
  await card.getByRole("combobox", { name: "Item name" }).fill("lionheart");
  await expect(card.getByRole("option", { name: /Lionheart Helm/ }).first()).toBeVisible();
});
