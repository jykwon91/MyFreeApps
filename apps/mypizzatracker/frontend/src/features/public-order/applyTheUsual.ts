import type {
  PublicMenu,
  PublicTheUsualPizza,
} from "@/types/public/public";

export interface TheUsualLine {
  pizza_type_id: string;
  topping_type_ids: string[];
  modifications_text: string;
}

/**
 * Take a "the usual" payload from the backend and the current public menu,
 * and return the lines that can actually be ordered today.
 *
 * The backend already filters out 86'd pizzas / toppings, but the menu the
 * customer sees could have shifted again between the lookup and the
 * "Order the usual" click. Defensive double-filter — drop lines whose pizza
 * isn't in ``menu.pizzas`` and remove toppings not in ``menu.toppings``.
 *
 * Returns an empty array when none of the prior items are orderable; the
 * caller suppresses the "Order the usual" button in that case.
 */
export function selectOrderableTheUsual(
  theUsual: PublicTheUsualPizza[],
  menu: PublicMenu,
): TheUsualLine[] {
  const pizzaIds = new Set(menu.pizzas.map((p) => p.id));
  const toppingIds = new Set(menu.toppings.map((t) => t.id));

  const lines: TheUsualLine[] = [];
  for (const line of theUsual) {
    if (!pizzaIds.has(line.pizza_type_id)) continue;
    lines.push({
      pizza_type_id: line.pizza_type_id,
      topping_type_ids: line.topping_type_ids.filter((id) =>
        toppingIds.has(id),
      ),
      modifications_text: line.modifications_text ?? "",
    });
  }
  return lines;
}

/**
 * Count digits in a free-form phone string. Used to gate when the
 * customer-lookup query should fire (we want at least a usable number,
 * not a single keystroke).
 */
export function countPhoneDigits(raw: string): number {
  return (raw.match(/\d/g) || []).length;
}
