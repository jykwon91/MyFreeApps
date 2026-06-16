import type { IngredientResponse } from "@/types/recipe/ingredient";
import type { IngredientSnapshot } from "@/types/recipe/diff";

/**
 * Render an ingredient as a single human line: "2 cups flour (sifted)".
 *
 * Quantity is formatted without trailing zeros (2 not 2.0); unit and note are
 * appended when present. Used by both the version body and the diff view so
 * the same ingredient reads identically in both places.
 */
export function formatIngredientLine(
  ingredient: IngredientResponse | IngredientSnapshot,
): string {
  const parts: string[] = [];
  if (ingredient.quantity !== null && ingredient.quantity !== undefined) {
    parts.push(formatQuantity(ingredient.quantity));
  }
  if (ingredient.unit) {
    parts.push(ingredient.unit);
  }
  parts.push(ingredient.name);
  const base = parts.join(" ");
  return ingredient.note ? `${base} (${ingredient.note})` : base;
}

function formatQuantity(quantity: number): string {
  return Number.isInteger(quantity)
    ? String(quantity)
    : String(parseFloat(quantity.toFixed(2)));
}
