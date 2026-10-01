/**
 * WoW Forever World Map — inside a dungeon: its bosses in order, each with a
 * sketch and the walk there, from the boss before or from the entrance.
 *
 * Frontend-only (static data + walk files), so nothing is seeded or stubbed.
 *
 * Run: npm run test:e2e -- wow-world-map-dungeons
 */
import { test, expect, type Page } from "@playwright/test";

async function deadmines(page: Page) {
  await page.goto("/wow-forever/map");
  await page.getByRole("radio", { name: "Alliance" }).click();
  await page.getByLabel("Zone").selectOption({ label: "Westfall" });
  await page.getByLabel("Level").fill("18");
  await page.getByRole("combobox", { name: "Where are you?" }).fill("42, 70");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  const row = page.getByRole("region", { name: "Dungeons & raids" }).getByRole("article", { name: "Dungeon: Deadmines" });
  await row.getByRole("button", { name: /Inside/ }).click();
  return row.getByRole("region", { name: "Inside Deadmines" });
}

test("a dungeon's bosses open to the walk there, from the boss before or the entrance", async ({ page }) => {
  const inside = await deadmines(page);
  const bosses = inside.getByRole("list", { name: /Bosses in/ });
  await expect(bosses).toContainText("VanCleef");
  await inside.getByRole("radio", { name: "From the boss before" }).click();

  const sneed = bosses.getByRole("button", { name: /Sneed/ });
  await sneed.click();
  await expect(sneed).toHaveAttribute("aria-expanded", "true");
  const panel = page.locator(`#${await sneed.getAttribute("aria-controls")}`);
  await expect(panel.locator("svg")).toBeVisible();
  expect(await panel.getByRole("listitem").count()).toBeGreaterThan(0);

  await inside.getByRole("radio", { name: "From the entrance" }).click();
  await expect(inside.getByRole("radio", { name: "From the entrance" })).toHaveAttribute("aria-checked", "true");
  await expect(panel).toContainText(/entrance/i);
});

test("the phone layout never scrolls sideways with a boss route open", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const inside = await deadmines(page);
  await inside.getByRole("list", { name: /Bosses in/ }).getByRole("button", { name: /VanCleef/ }).click();
  await expect(inside.locator("svg").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
