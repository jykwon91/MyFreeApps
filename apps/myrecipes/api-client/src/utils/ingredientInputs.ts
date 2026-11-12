import type { DecimalSeparator } from "../types/recipe/decimal-separator";
import type { EditableIngredientRow } from "../types/recipe/editable-ingredient-row";
import type { IngredientInput } from "../types/recipe/ingredient";
import { parseRecipeNumber } from "./parseRecipeNumber";

/** The named rows, trimmed, as the API takes them. Rows with no name are left out. */
export function ingredientInputs(rows: EditableIngredientRow[], decimalSeparator: DecimalSeparator): IngredientInput[] {
  return rows
    .filter((row) => row.name.trim() !== "")
    .map((row) => {
      const quantity = parseRecipeNumber(row.quantity, decimalSeparator);
      return {
        name: row.name.trim(),
        quantity: quantity === null || Number.isNaN(quantity) ? null : quantity,
        unit: row.unit.trim() || null,
        note: row.note.trim() || null,
        lineage_key: row.lineageKey,
      };
    });
}
