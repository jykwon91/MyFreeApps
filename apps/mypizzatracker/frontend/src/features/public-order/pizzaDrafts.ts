import type { PizzaLineDraft } from "@/types/public/PizzaLineDraft";
import type { PublicMenu } from "@/types/public/public";

export function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export function newDraft(menu: PublicMenu): PizzaLineDraft {
  return {
    localId: cryptoRandomId(),
    pizza_type_id: menu.pizzas[0]?.id ?? "",
    topping_type_ids: new Set(),
    modifications_text: "",
  };
}

export function computeTotalForDrafts(
  lines: PizzaLineDraft[], menu: PublicMenu,
): number {
  let total = 0;
  for (const line of lines) {
    const pizza = menu.pizzas.find((p) => p.id === line.pizza_type_id);
    if (!pizza) continue;
    total += Number(pizza.price);
    for (const toppingId of line.topping_type_ids) {
      const topping = menu.toppings.find((t) => t.id === toppingId);
      if (topping) total += Number(topping.price_delta);
    }
  }
  return total;
}
