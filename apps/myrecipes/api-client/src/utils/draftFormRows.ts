import type { DecimalSeparator } from "../types/recipe/decimal-separator";
import type { EditableIngredientRow } from "../types/recipe/editable-ingredient-row";
import type { EditableStepRow } from "../types/recipe/editable-step-row";
import type { RecipeExtractionDraft } from "../types/recipe/extraction";
import { formatRecipeNumber } from "./formatRecipeNumber";

/**
 * An extracted draft's ingredients (photo import or discovery) as editor rows: all new, so no
 * lineage keys, with amounts shown in the user's decimal separator so they read back the same.
 * Keys come from the caller: web and phone make unique ids differently.
 */
export function draftIngredientRows(
  ingredients: RecipeExtractionDraft["ingredients"],
  decimalSeparator: DecimalSeparator,
  makeKey: () => string,
): EditableIngredientRow[] {
  return ingredients.map((ingredient) => ({
    key: makeKey(),
    name: ingredient.name,
    quantity: formatRecipeNumber(ingredient.quantity, decimalSeparator),
    unit: ingredient.unit ?? "",
    note: ingredient.note ?? "",
    lineageKey: null,
  }));
}

export function draftStepRows(steps: RecipeExtractionDraft["steps"], makeKey: () => string): EditableStepRow[] {
  return steps.map((step) => ({ key: makeKey(), instruction: step.instruction }));
}
