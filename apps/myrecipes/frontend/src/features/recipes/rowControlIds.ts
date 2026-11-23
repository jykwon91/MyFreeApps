type IngredientField = "name" | "quantity" | "unit" | "note";

/** The id of an ingredient row's control, so its problem can be tied to it. */
export function ingredientControlId(rowKey: string, field: IngredientField): string {
  return `ingredient-${rowKey}-${field}`;
}

/** The id of a step row's textarea. */
export function stepControlId(rowKey: string): string {
  return `step-${rowKey}`;
}
