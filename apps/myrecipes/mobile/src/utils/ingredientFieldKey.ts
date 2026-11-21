import type { IngredientField } from "../types/IngredientField";
import type { IngredientFieldKey } from "../types/IngredientFieldKey";

/** The keyboard chain's name for one field of one ingredient row. */
export function ingredientFieldKey(rowKey: string, field: IngredientField): IngredientFieldKey {
  return `${rowKey}:${field}`;
}
