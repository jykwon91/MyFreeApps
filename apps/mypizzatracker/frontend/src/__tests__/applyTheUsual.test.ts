import { describe, expect, it } from "vitest";

import {
  countPhoneDigits,
  selectOrderableTheUsual,
} from "@/features/public-order/applyTheUsual";
import type {
  PublicMenu,
  PublicTheUsualPizza,
} from "@/types/public/public";

const PIZZA_ID_A = "pizza-a";
const PIZZA_ID_B = "pizza-b";
const TOPPING_ID_X = "topping-x";
const TOPPING_ID_Y = "topping-y";

function menu(opts: {
  pizzas?: string[];
  toppings?: string[];
}): PublicMenu {
  return {
    pizzas: (opts.pizzas ?? []).map((id) => ({
      id,
      name: id,
      price: "10.00",
      description: null,
    })),
    toppings: (opts.toppings ?? []).map((id) => ({
      id,
      name: id,
      price_delta: "0",
    })),
  };
}

function line(
  pizza_type_id: string,
  topping_type_ids: string[] = [],
  modifications_text: string | null = null,
): PublicTheUsualPizza {
  return { pizza_type_id, topping_type_ids, modifications_text };
}

describe("selectOrderableTheUsual", () => {
  it("returns empty when menu has none of the prior pizzas", () => {
    const result = selectOrderableTheUsual(
      [line(PIZZA_ID_A)],
      menu({ pizzas: [PIZZA_ID_B] }),
    );
    expect(result).toEqual([]);
  });

  it("passes through pizzas that are still active", () => {
    const result = selectOrderableTheUsual(
      [line(PIZZA_ID_A, [TOPPING_ID_X], "extra crispy")],
      menu({ pizzas: [PIZZA_ID_A], toppings: [TOPPING_ID_X] }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      pizza_type_id: PIZZA_ID_A,
      topping_type_ids: [TOPPING_ID_X],
      modifications_text: "extra crispy",
    });
  });

  it("strips toppings that are no longer on the menu", () => {
    const result = selectOrderableTheUsual(
      [line(PIZZA_ID_A, [TOPPING_ID_X, TOPPING_ID_Y])],
      menu({ pizzas: [PIZZA_ID_A], toppings: [TOPPING_ID_X] }),
    );
    expect(result[0].topping_type_ids).toEqual([TOPPING_ID_X]);
  });

  it("normalises null modifications_text to an empty string", () => {
    const result = selectOrderableTheUsual(
      [line(PIZZA_ID_A)],
      menu({ pizzas: [PIZZA_ID_A] }),
    );
    expect(result[0].modifications_text).toBe("");
  });

  it("drops 86'd pizzas but keeps remaining orderable lines", () => {
    const result = selectOrderableTheUsual(
      [line(PIZZA_ID_A), line(PIZZA_ID_B)],
      menu({ pizzas: [PIZZA_ID_B] }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].pizza_type_id).toBe(PIZZA_ID_B);
  });
});

describe("countPhoneDigits", () => {
  it("counts only digit characters", () => {
    expect(countPhoneDigits("(512) 555-1234")).toBe(10);
    expect(countPhoneDigits("abc")).toBe(0);
    expect(countPhoneDigits("")).toBe(0);
    expect(countPhoneDigits("5")).toBe(1);
  });
});
