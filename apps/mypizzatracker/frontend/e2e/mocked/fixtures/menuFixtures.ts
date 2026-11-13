/** The operator menu as GET /menu answers it (MenuRead, app/schemas/menu/menu_schemas.py). */
import type { Menu, PizzaType, PizzaTypeCreateBody, ToppingType, ToppingTypeCreateBody } from "@/types/menu/menu";
import { FIXTURE_NOW } from "../constants/fixtureTimes";
import { pizzaIdAt, toppingIdAt } from "./fixtureIds";

export function pizzaOf(n: number, fields: Partial<PizzaType> = {}): PizzaType {
  return {
    id: pizzaIdAt(n),
    name: "Margherita",
    price: "12.00",
    description: null,
    active: true,
    created_at: FIXTURE_NOW,
    updated_at: FIXTURE_NOW,
    ...fields,
  };
}

export function toppingOf(n: number, fields: Partial<ToppingType> = {}): ToppingType {
  return {
    id: toppingIdAt(n),
    name: "Basil",
    price_delta: "0.00",
    active: true,
    created_at: FIXTURE_NOW,
    updated_at: FIXTURE_NOW,
    ...fields,
  };
}

/** What POST /menu/pizzas answers for `body`. */
export function pizzaFromCreate(n: number, body: PizzaTypeCreateBody): PizzaType {
  return pizzaOf(n, { name: body.name, price: body.price, description: body.description ?? null, active: body.active ?? true });
}

/** What POST /menu/toppings answers for `body`. */
export function toppingFromCreate(n: number, body: ToppingTypeCreateBody): ToppingType {
  return toppingOf(n, { name: body.name, price_delta: body.price_delta ?? "0.00", active: body.active ?? true });
}

export function sampleMenu(): Menu {
  return {
    pizzas: [
      pizzaOf(1, { description: "Tomato, mozzarella, basil" }),
      pizzaOf(2, { name: "Pepperoni", price: "14.50" }),
      pizzaOf(3, { name: "White Pie", price: "13.00", active: false }),
    ],
    toppings: [toppingOf(1), toppingOf(2, { name: "Mushrooms", price_delta: "1.50" })],
  };
}
