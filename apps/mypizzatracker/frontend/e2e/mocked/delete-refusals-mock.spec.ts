/**
 * No-backend E2E for deletes the server refuses with a 409: a pizza or
 * topping that past orders use, and a slot that orders point at. The
 * operator sees the server's reason in a toast, the confirm dialog closes,
 * and the row stays put.
 */
import type { Page, Route } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { toast } from "@platform/ui/test-support/toast";
import { json } from "@platform/ui/test-support/mockResponse";
import { apiPath } from "@platform/ui/test-support/apiPath";
import { CARD } from "./constants/layoutSelectors";
import { ACTIVE_DROP_ID } from "./fixtures/dropFixtures";
import { pizzaIdAt, slotIdAt, toppingIdAt } from "./fixtures/fixtureIds";
import { stubDropsApi } from "./fixtures/stubDropsApi";
import { stubMenuApi } from "./fixtures/stubMenuApi";

const PIZZA_IN_ORDERS =
  "Margherita is in past orders, so it can't be deleted. Mark it unavailable (86 it) instead.";
const TOPPING_IN_ORDERS =
  "Basil is in past orders, so it can't be deleted. Mark it unavailable (86 it) instead.";
const SLOT_HAS_ORDERS =
  "The 17:00 slot has orders, so it can't be removed. Move those orders to another slot first.";

/** Answers DELETE on `path` with a 409 carrying `detail`; records the paths hit. */
async function refuseDelete(page: Page, path: RegExp, detail: string): Promise<string[]> {
  const hits: string[] = [];
  await page.route(apiPath(path), (route: Route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    hits.push(new URL(route.request().url()).pathname);
    return route.fulfill(json({ detail }, 409));
  });
  return hits;
}

function section(page: Page, heading: string) {
  return page.getByRole("main").locator(CARD).filter({ has: page.getByRole("heading", { name: heading, level: 2 }) });
}

test.beforeEach(async ({ page }) => {
  await stubSignedInShell(page);
});

test("deleting a pizza that past orders use explains to 86 it instead", async ({ page }) => {
  await stubMenuApi(page);
  const hits = await refuseDelete(page, /^\/menu\/pizzas\/[^/]+$/, PIZZA_IN_ORDERS);

  await page.goto("/menu");
  const margherita = section(page, "Pizzas").getByRole("listitem").filter({ hasText: "Margherita" });
  await margherita.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();

  await expect(toast(page, PIZZA_IN_ORDERS)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(margherita.getByRole("button", { name: "86", exact: true })).toBeVisible();
  expect(hits).toEqual([expect.stringMatching(new RegExp(`/menu/pizzas/${pizzaIdAt(1)}$`))]);
});

test("deleting a topping that past orders use explains to 86 it instead", async ({ page }) => {
  await stubMenuApi(page);
  const hits = await refuseDelete(page, /^\/menu\/toppings\/[^/]+$/, TOPPING_IN_ORDERS);

  await page.goto("/menu");
  const basil = section(page, "Toppings").getByRole("listitem").filter({ hasText: "Basil" });
  await basil.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();

  await expect(toast(page, TOPPING_IN_ORDERS)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(basil).toBeVisible();
  expect(hits).toEqual([expect.stringMatching(new RegExp(`/menu/toppings/${toppingIdAt(1)}$`))]);
});

test("removing a slot that has orders explains to move them first", async ({ page }) => {
  await stubDropsApi(page);
  const hits = await refuseDelete(page, /^\/drops\/[^/]+\/slots\/[^/]+$/, SLOT_HAS_ORDERS);

  await page.goto("/drops");
  const active = page.getByRole("main").locator(CARD).filter({ has: page.getByRole("heading", { name: "Friday Night Drop" }) });
  const slot = active.getByRole("listitem").filter({ hasText: "17:00 -- 6 pizzas" });
  await slot.getByRole("button", { name: "Remove slot" }).click();

  await expect(toast(page, SLOT_HAS_ORDERS)).toBeVisible();
  await expect(slot).toBeVisible();
  expect(hits).toEqual([
    expect.stringMatching(new RegExp(`/drops/${ACTIVE_DROP_ID}/slots/${slotIdAt(1)}$`)),
  ]);
});
