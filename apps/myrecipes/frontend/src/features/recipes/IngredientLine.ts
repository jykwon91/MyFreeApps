/**
 * The parts of an ingredient this formatter reads.
 *
 * Structural rather than a union of the concrete types, so a saved
 * ingredient, a diff snapshot, and an unsaved draft (photo import, web
 * discovery) all read identically without this module knowing about each of
 * them.
 */
export interface IngredientLineParts {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  note?: string | null;
}

/**
 * Render an ingredient as a single human line: "2 cups flour (sifted)".
 *
 * Quantity is formatted without trailing zeros (2 not 2.0); unit and note are
 * appended when present. Used by the version body, the diff view, and the
 * discovery preview so the same ingredient reads identically everywhere.
 */
export function formatIngredientLine(ingredient: IngredientLineParts): string {
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
