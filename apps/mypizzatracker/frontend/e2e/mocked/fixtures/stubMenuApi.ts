/**
 * Stubs the operator's menu API (app/api/menu.py) over state the writes
 * change: GET /menu answers pizzas and toppings, each sorted by name like
 * menu_repo; POST adds a row; PATCH merges the body into the row.
 */
import type { Page } from "@playwright/test";
import { json } from "@platform/ui/test-support/mockResponse";
import type { SentRequest } from "@platform/ui/test-support/types/SentRequest";
import type {
  Menu,
  PizzaTypeCreateBody,
  PizzaTypeUpdateBody,
  ToppingTypeCreateBody,
  ToppingTypeUpdateBody,
} from "@/types/menu/menu";
import { apiPath, pathId } from "@platform/ui/test-support/apiPath";
import { byName, pizzaFromCreate, sampleMenu, toppingFromCreate } from "./menuFixtures";
import { recordWrite } from "@platform/ui/test-support/recordWrite";

const MENU = /^\/menu$/;
const PIZZAS = /^\/menu\/pizzas$/;
const PIZZA = /^\/menu\/pizzas\/([^/]+)$/;
const TOPPINGS = /^\/menu\/toppings$/;
const TOPPING = /^\/menu\/toppings\/([^/]+)$/;
const NOT_FOUND = { detail: "Not Found" };
const FIRST_NEW = 100;

export async function stubMenuApi(page: Page, menu: Menu = sampleMenu()): Promise<SentRequest[]> {
  const writes: SentRequest[] = [];
  const state: Menu = { pizzas: [...menu.pizzas], toppings: [...menu.toppings] };
  let created = FIRST_NEW;

  await page.route(apiPath(MENU), (route) =>
    route.fulfill(json({ pizzas: byName(state.pizzas), toppings: byName(state.toppings) })),
  );

  await page.route(apiPath(PIZZAS), (route) => {
    const pizza = pizzaFromCreate(created++, recordWrite(writes, route.request()) as PizzaTypeCreateBody);
    state.pizzas = [...state.pizzas, pizza];
    return route.fulfill(json(pizza, 201));
  });
  await page.route(apiPath(PIZZA), (route) => {
    const id = pathId(PIZZA, route.request());
    const pizza = state.pizzas.find((p) => p.id === id);
    if (!pizza) return route.fulfill(json(NOT_FOUND, 404));
    const updated = { ...pizza, ...(recordWrite(writes, route.request()) as PizzaTypeUpdateBody) };
    state.pizzas = state.pizzas.map((p) => (p.id === id ? updated : p));
    return route.fulfill(json(updated));
  });

  await page.route(apiPath(TOPPINGS), (route) => {
    const topping = toppingFromCreate(created++, recordWrite(writes, route.request()) as ToppingTypeCreateBody);
    state.toppings = [...state.toppings, topping];
    return route.fulfill(json(topping, 201));
  });
  await page.route(apiPath(TOPPING), (route) => {
    const id = pathId(TOPPING, route.request());
    const topping = state.toppings.find((t) => t.id === id);
    if (!topping) return route.fulfill(json(NOT_FOUND, 404));
    const updated = { ...topping, ...(recordWrite(writes, route.request()) as ToppingTypeUpdateBody) };
    state.toppings = state.toppings.map((t) => (t.id === id ? updated : t));
    return route.fulfill(json(updated));
  });

  return writes;
}
