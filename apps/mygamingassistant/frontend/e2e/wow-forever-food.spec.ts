/**
 * WoW Forever "What should I eat?" food picker — static, frontend-only page.
 *
 * Run: npm run test:e2e -- wow-forever-food
 */
import { test, expect } from "@playwright/test";

test("from the landing card: enter a level and class, get a pick", async ({ page }) => {
  await page.goto("/wow-forever");
  await page.getByRole("link", { name: /What should I eat\?/ }).click();
  await expect(page).toHaveURL(/\/wow-forever\/food/);
  await expect(page.getByText("Enter your level to see what to cook.")).toBeVisible();

  await page.getByLabel("Your level").fill("45");
  await page.getByLabel("Class").selectOption("mage");
  await page.getByLabel("Spec").selectOption("fire");
  await page.getByRole("radio", { name: "Raid" }).click();
  await expect(page.locator("#food-top-pick")).toHaveText("Baked Salmon");
  await expect(page.getByText(/Pawn's Classic Era weights for Fire Mage/)).toBeVisible();
  await expect(page).toHaveURL(/lvl=45.*class=mage|class=mage.*lvl=45/);
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

test("from the Cooking guide: pick Just healing and see the biggest heal", async ({ page }) => {
  await page.goto("/wow-forever/professions");
  await page.getByRole("link", { name: /Try the food picker/ }).click();
  await expect(page).toHaveURL(/\/wow-forever\/food/);

  await page.getByLabel("Your level").fill("5");
  await page.getByRole("radio", { name: "Just healing" }).click();
  await expect(page.locator("#food-top-pick")).toHaveText("Longjaw Mud Snapper");
  await expect(page.getByText(/Heals the most of what you can eat: 552 health over 24 sec/)).toBeVisible();
});

test("the phone layout never scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/wow-forever/food?lvl=60&class=priest&spec=holy&act=raid&skill=200");
  await expect(page.locator("#food-top-pick")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("click a food to see where to get the recipe, then get directions to the vendor", async ({ page }) => {
  await page.goto("/wow-forever/food");
  await page.getByLabel("Your level").fill("20");
  await page.getByLabel("Class").selectOption("warlock");
  await page.getByRole("link", { name: "Gooey Spider Cake" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Gooey Spider Cake" })).toBeVisible();
  await expect(page.getByText("Buy the recipe from Kendor Kabonka in Stormwind City.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "2× Gooey Spider Leg" })).toBeVisible();

  await page.getByRole("link", { name: "Back to What should I eat?" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/food\?.*lvl=20/);
  await page.getByRole("link", { name: "Gooey Spider Cake" }).click();

  await page.getByRole("link", { name: "Directions to Kendor Kabonka" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/map\?to=pt%3A1453/);
  await expect(page.getByRole("heading", { name: "Directions" })).toBeVisible();
});

test("the food detail page never scrolls sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/wow-forever/food/733");
  await expect(page.getByRole("heading", { level: 1, name: "Westfall Stew" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
