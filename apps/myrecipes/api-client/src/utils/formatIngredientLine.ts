import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import type { IngredientLineParts } from "../types/recipe/ingredient-line-parts";
import { formatRecipeNumber } from "./formatRecipeNumber";

/**
 * Render an ingredient as a single human line: "2 cups flour (sifted)".
 *
 * Quantity is formatted without trailing zeros (2 not 2.0); unit and note are
 * appended when present. Used by the version body, the diff view, and the
 * discovery preview so the same ingredient reads identically everywhere. The
 * quantity uses the reader's decimal separator, the one the recipe form types it in.
 */
export function formatIngredientLine(ingredient: IngredientLineParts, decimalSeparator: DecimalSeparator): string {
  const parts: string[] = [];
  if (ingredient.quantity !== null && ingredient.quantity !== undefined) {
    parts.push(formatRecipeNumber(roundQuantity(ingredient.quantity), decimalSeparator));
  }
  if (ingredient.unit) {
    parts.push(ingredient.unit);
  }
  parts.push(ingredient.name);
  const base = parts.join(" ");
  return ingredient.note ? `${base} (${ingredient.note})` : base;
}

function roundQuantity(quantity: number): number {
  return Number.isInteger(quantity) ? quantity : parseFloat(quantity.toFixed(2));
}
