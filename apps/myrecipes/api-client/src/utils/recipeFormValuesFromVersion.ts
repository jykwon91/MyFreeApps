import type { DecimalSeparator } from "../types/recipe/decimal-separator";
import type { RecipeVersionFormValues } from "../types/recipe/recipe-version-form-values";
import type { VersionResponse } from "../types/recipe/version";
import { formatRecipeNumber } from "./formatRecipeNumber";

/**
 * A tweak's form, filled in from the version it starts from. Each ingredient CARRIES its
 * lineage_key, so the diff reads "same ingredient, changed" rather than one removed and one added.
 * Amounts and minutes are shown in the user's decimal separator, the one the form reads them back in.
 * Keys come from the caller: web and phone make unique ids differently.
 */
export function recipeFormValuesFromVersion(
  version: VersionResponse,
  decimalSeparator: DecimalSeparator,
  makeKey: () => string,
): RecipeVersionFormValues {
  return {
    servings: version.servings ?? "",
    prepMinutes: formatRecipeNumber(version.prep_minutes, decimalSeparator),
    cookMinutes: formatRecipeNumber(version.cook_minutes, decimalSeparator),
    ingredients: version.ingredients.map((ingredient) => ({
      key: makeKey(),
      name: ingredient.name,
      quantity: formatRecipeNumber(ingredient.quantity, decimalSeparator),
      unit: ingredient.unit ?? "",
      note: ingredient.note ?? "",
      lineageKey: ingredient.lineage_key,
    })),
    steps: version.steps.map((step) => ({ key: makeKey(), instruction: step.instruction })),
  };
}
