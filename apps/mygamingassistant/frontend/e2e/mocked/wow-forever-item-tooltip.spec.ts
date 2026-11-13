/**
 * WoW Forever item-name tooltip — hover / keyboard focus on an item name shows
 * its in-game stats; a tap on a phone still opens the item page.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-item-tooltip
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

async function openGearAtLevel60(page: Page): Promise<Locator> {
  await page.goto("/wow-forever/gear");
  // The list is empty until a level is entered.
  await page.getByLabel("Your level").fill("60");
  const firstName = page.getByTestId("gear-item-row").first().getByRole("link");
  await expect(firstName).toBeVisible();
  return firstName;
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("hovering an item on Best gear shows its stats beside the name; leaving hides it", async ({ page }) => {
  const name = await openGearAtLevel60(page);
  const itemName = (await name.textContent()) ?? "";

  await name.hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(name).toHaveAttribute("aria-describedby", (await tooltip.getAttribute("id")) ?? "");
  const stats = tooltip.getByTestId("item-stats");
  await expect(stats).toContainText(itemName);
  await expect(stats).toContainText(/Item Level \d+/);
  await expect(stats).not.toContainText("Vendor price");

  // Inside the viewport, and never on top of the name being hovered.
  const box = await tooltip.boundingBox();
  const nameBox = await name.boundingBox();
  const viewport = page.viewportSize();
  expect(box && nameBox && viewport).toBeTruthy();
  if (box && nameBox && viewport) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(overlaps(box, nameBox)).toBe(false);
  }

  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);
  await expect(name).not.toHaveAttribute("aria-describedby", /.+/);
});

test("a name at the top of the window gets its tooltip below it, still inside the window", async ({ page }) => {
  const name = await openGearAtLevel60(page);
  await name.evaluate((el) => {
    el.scrollIntoView({ block: "start" });
    window.scrollBy(0, el.getBoundingClientRect().top - 4);
  });
  await name.hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveAttribute("data-placement", /^bottom/);
  const box = await tooltip.boundingBox();
  const nameBox = await name.boundingBox();
  expect(box && nameBox).toBeTruthy();
  if (box && nameBox) {
    expect(box.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height);
    expect(box.x).toBeGreaterThanOrEqual(0);
  }
});

test("keyboard focus on an item name shows its tooltip and Escape hides it", async ({ page }) => {
  const name = await openGearAtLevel60(page);
  // Real keyboard focus: land on the name with Tab, as a keyboard user would.
  await name.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(name).toBeFocused();

  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip.getByTestId("item-stats")).toContainText(/Item Level \d+/);

  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test("tapping an item name opens its page — no tooltip, no sideways scroll", async ({ page }) => {
    const name = await openGearAtLevel60(page);
    await name.tap();
    await expect(page).toHaveURL(/\/wow-forever\/items\/\d+$/);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect(page.getByTestId("item-stats")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
