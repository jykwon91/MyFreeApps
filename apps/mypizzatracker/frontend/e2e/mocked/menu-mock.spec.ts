/**
 * No-backend E2E for /menu: pizzas and toppings load with their prices and
 * 86 state, the skeleton has the page's two sections, a failed load offers a
 * retry, and the operator adds, edits and 86es rows, each sending the right
 * request and showing the result.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { measureBoxes } from "@platform/ui/test-support/layoutShift";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { toast } from "@platform/ui/test-support/toast";
import { CARD } from "./constants/layoutSelectors";
import { apiPath } from "./fixtures/apiPath";
import { pizzaIdAt } from "./fixtures/fixtureIds";
import { failReads, holdReads } from "./fixtures/routeControls";
import { expectSameColumns, skeletonCards } from "./fixtures/skeletonLayout";
import { stubMenuApi } from "./fixtures/stubMenuApi";

const MENU_READ = apiPath(/^\/menu$/);

function section(page: Page, heading: string) {
  return page.getByRole("main").locator(CARD).filter({ has: page.getByRole("heading", { name: heading, level: 2 }) });
}

test.beforeEach(async ({ page }) => {
  await stubSignedInShell(page);
});

test("lists pizzas and toppings with prices, descriptions and which are 86'd", async ({ page }) => {
  await stubMenuApi(page);

  await page.goto("/menu");
  const pizzas = section(page, "Pizzas").getByRole("listitem");
  await expect(pizzas).toHaveCount(3);
  await expect(pizzas.nth(0)).toContainText("Margherita$12.00Tomato, mozzarella, basil");
  await expect(pizzas.nth(1)).toContainText("Pepperoni$14.50");
  await expect(pizzas.nth(2).getByText("86'd", { exact: true })).toBeVisible();
  await expect(pizzas.nth(2).getByRole("button", { name: "Un-86" })).toBeVisible();

  const toppings = section(page, "Toppings").getByRole("listitem");
  await expect(toppings).toHaveCount(2);
  await expect(toppings.nth(0)).toContainText("Basilfree");
  await expect(toppings.nth(1)).toContainText("Mushrooms+$1.50");
});

test("the loading skeleton has the page's two sections, in their column", async ({ page }) => {
  await stubMenuApi(page);
  const gate = await holdReads(page, MENU_READ);

  try {
    await page.goto("/menu");
    const skeleton = skeletonCards(page);
    await expect(skeleton).toHaveCount(2);
    const boxes = await measureBoxes(skeleton);

    gate.release();
    await expect(skeleton).toHaveCount(0);
    await expectSameColumns(boxes, page.getByRole("main").locator(CARD));
    await expect(section(page, "Pizzas")).toBeVisible();
    await expect(section(page, "Toppings")).toBeVisible();
  } finally {
    gate.release();
  }
});

test("a failed load says so and Retry loads the menu", async ({ page }) => {
  await stubMenuApi(page);
  await failReads(page, MENU_READ);

  await page.goto("/menu");
  await expect(page.getByRole("heading", { name: "Could not load the menu" })).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();

  await expect(section(page, "Pizzas").getByRole("listitem")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Could not load the menu" })).toHaveCount(0);
});

test("adds a pizza, which the list then shows", async ({ page }) => {
  const writes = await stubMenuApi(page);

  await page.goto("/menu");
  const pizzas = section(page, "Pizzas");
  await pizzas.getByRole("button", { name: "Add pizza" }).click();
  await pizzas.getByLabel("Name").fill("Calabrese");
  await pizzas.getByLabel("Price").fill("15.25");
  await pizzas.getByLabel("Description").fill("Spicy salami");
  await pizzas.getByRole("button", { name: "Add", exact: true }).click();

  await expect(toast(page, "Pizza added")).toBeVisible();
  await expect(pizzas.getByRole("listitem")).toHaveCount(4);
  await expect(pizzas.getByRole("listitem").nth(3)).toContainText("Calabrese$15.25Spicy salami");
  expect(writes).toEqual([
    { method: "POST", path: "/menu/pizzas", body: { name: "Calabrese", price: "15.25", description: "Spicy salami" } },
  ]);
});

test("edits a pizza's price and 86es another", async ({ page }) => {
  const writes = await stubMenuApi(page);

  await page.goto("/menu");
  const rows = section(page, "Pizzas").getByRole("listitem");
  await rows.nth(1).getByRole("button", { name: "Edit" }).click();
  await rows.nth(1).getByLabel("Price").fill("15.00");
  await rows.nth(1).getByRole("button", { name: "Save" }).click();

  await expect(toast(page, "Updated")).toBeVisible();
  await expect(rows.nth(1)).toContainText("Pepperoni$15.00");

  await rows.nth(0).getByRole("button", { name: "86", exact: true }).click();
  await expect(toast(page, "86'd")).toBeVisible();
  await expect(rows.nth(0).getByText("86'd", { exact: true })).toBeVisible();
  await expect(rows.nth(0).getByRole("button", { name: "Un-86" })).toBeVisible();

  expect(writes).toEqual([
    { method: "PATCH", path: `/menu/pizzas/${pizzaIdAt(2)}`, body: { name: "Pepperoni", price: "15.00", description: null } },
    { method: "PATCH", path: `/menu/pizzas/${pizzaIdAt(1)}`, body: { active: false } },
  ]);
});

test("adds a topping with its price", async ({ page }) => {
  const writes = await stubMenuApi(page);

  await page.goto("/menu");
  const toppings = section(page, "Toppings");
  await toppings.getByRole("button", { name: "Add topping" }).click();
  await toppings.getByLabel("Name").fill("Jalapeño");
  await toppings.getByLabel("Price delta").fill("0.75");
  await toppings.getByRole("button", { name: "Add", exact: true }).click();

  await expect(toast(page, "Topping added")).toBeVisible();
  await expect(toppings.getByRole("listitem").nth(2)).toContainText("Jalapeño+$0.75");
  expect(writes).toEqual([{ method: "POST", path: "/menu/toppings", body: { name: "Jalapeño", price_delta: "0.75" } }]);
});
