/**
 * WoW Forever "What should I eat?" food picker — static, frontend-only page.
 *
 * Run: npm run test:e2e -- wow-forever-food
 */
import { test, expect } from "@playwright/test";

test("reaches the picker from the landing card and asks for a level", async ({ page }) => {
  await page.goto("/wow-forever");
  await page.getByRole("link", { name: /What should I eat\?/ }).click();
  await expect(page).toHaveURL(/\/wow-forever\/food/);
  await expect(page.getByText("Enter your level to see what to cook.")).toBeVisible();
});

test("answers for a level, class and activity and keeps it in the URL", async ({ page }) => {
  await page.goto("/wow-forever/food");
  await page.getByLabel("Your level").fill("35");
  await page.getByLabel("Class").selectOption("warrior");
  await expect(page.locator("#food-top-pick")).toHaveText("Poached Sunscale Salmon");
  await expect(page.getByText(/Next upgrade at level 55/)).toBeVisible();

  await page.getByRole("radio", { name: "Fishing" }).click();
  await expect(page.locator("#food-top-pick")).toHaveText("Filet of Redgill");
  await expect(page).toHaveURL(/act=fishing/);

  await page.reload();
  await expect(page.locator("#food-top-pick")).toHaveText("Filet of Redgill");
});

test("Cooking skill splits what you can cook from what's worth training for", async ({ page }) => {
  await page.goto("/wow-forever/food?lvl=60&class=priest&spec=holy&act=raid&skill=200");
  await expect(page.locator("#food-top-pick")).toHaveText("Sunny Tea");
  await expect(page.getByRole("heading", { name: "Worth training for" })).toBeVisible();
  await expect(page.getByText(/Sunrise Omelette/)).toBeVisible();
});

test("the Cooking guide links to the picker", async ({ page }) => {
  await page.goto("/wow-forever/professions");
  await page.getByRole("link", { name: /Try the food picker/ }).click();
  await expect(page).toHaveURL(/\/wow-forever\/food/);
});

test("the phone layout never scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/wow-forever/food?lvl=60&class=priest&spec=holy&act=raid&skill=200");
  await expect(page.locator("#food-top-pick")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
