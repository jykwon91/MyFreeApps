/**
 * WoW Forever New Player Guide — Macros section. Static, frontend-only.
 *
 * Run: npm run test:e2e -- wow-forever-guide-macros
 */
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
});

test("the jump link reaches the Macros section", async ({ page }) => {
  await page.goto("/wow-forever/guide");
  await page.getByRole("link", { name: "Macros", exact: true }).click();
  await expect(page).toHaveURL(/#macros$/);
  await expect(page.getByRole("heading", { name: "Macros", level: 2 })).toBeInViewport();
});

test("typing a spell fills the templates, and Copy puts it on the clipboard", async ({ page }) => {
  await page.goto("/wow-forever/guide#macros");
  const friendly = page.getByRole("article", { name: "Friendly mouseover" });
  await expect(friendly.getByTestId("macro-text")).toContainText("[@player] Spell Name");

  await page.getByLabel("Your spell name").fill("Flash Heal");
  await expect(friendly.getByTestId("macro-text")).toHaveText(
    "#showtooltip\n/cast [@mouseover,help,nodead][help,nodead][@player] Flash Heal",
  );

  const button = friendly.getByRole("button", { name: "Copy macro: Friendly mouseover" });
  await button.click();
  await expect(button).toContainText("Copied");
  await expect(page.getByText('Copied "Friendly mouseover"', { exact: true })).toBeVisible();
  // Windows browsers hand the clipboard back with CRLF line ends.
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.replace(/\r\n/g, "\n")).toBe("#showtooltip\n/cast [@mouseover,help,nodead][help,nodead][@player] Flash Heal");

  await page.getByLabel("Your spell name").fill("");
  await expect(friendly.getByTestId("macro-text")).toContainText("Spell Name");
});

test("ready-made macros are grouped by class and copy as shown", async ({ page }) => {
  await page.goto("/wow-forever/guide#macros");
  for (const name of ["Druid", "Hunter", "Mage", "Paladin", "Priest", "Shaman", "Warlock"]) {
    await expect(page.getByRole("heading", { name, level: 4 })).toBeVisible();
  }
  const card = page.getByRole("article", { name: "Earth Shock (Shaman)" });
  await expect(card.getByTestId("macro-text")).toHaveText("#showtooltip\n/cast [@mouseover,harm,nodead][] Earth Shock");
  await card.getByRole("button", { name: "Copy macro: Earth Shock (Shaman)" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.replace(/\r\n/g, "\n")).toBe("#showtooltip\n/cast [@mouseover,harm,nodead][] Earth Shock");
  await expect(page.getByRole("link", { name: "More Warlock macros" })).toHaveAttribute("href", "/wow-forever/warlock-macros");
});

test("the phone layout never scrolls sideways and keeps touch targets large", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/wow-forever/guide#macros");
  await page.getByLabel("Your spell name").fill("X".repeat(60));
  const input = await page.getByLabel("Your spell name").boundingBox();
  expect(input?.height).toBeGreaterThanOrEqual(44);
  const copy = page.getByRole("button", { name: "Copy macro: Friendly mouseover" });
  const box = await copy.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(44);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
