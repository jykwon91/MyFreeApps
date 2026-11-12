import type { DecimalSeparator } from "../types/recipe/decimal-separator";
import type { RecipeExtractionDraft } from "../types/recipe/extraction";
import type { RecipeFormValues } from "../types/recipe/recipe-form-values";
import { draftIngredientRows, draftStepRows } from "./draftFormRows";
import { emptyIngredientRow, emptyStepRow } from "./emptyRecipeRows";
import { formatRecipeNumber } from "./formatRecipeNumber";

/**
 * The new-recipe form filled in from an extracted draft, for the user to review before creating.
 * A draft with no ingredients or no steps still gets one empty row of each to type into.
 */
export function recipeFormValuesFromDraft(
  draft: RecipeExtractionDraft,
  decimalSeparator: DecimalSeparator,
  makeKey: () => string,
): RecipeFormValues {
  const ingredients = draftIngredientRows(draft.ingredients, decimalSeparator, makeKey);
  const steps = draftStepRows(draft.steps, makeKey);
  return {
    title: draft.title,
    description: draft.description ?? "",
    source: draft.source ?? "",
    servings: draft.servings ?? "",
    prepMinutes: formatRecipeNumber(draft.prep_minutes, decimalSeparator),
    cookMinutes: formatRecipeNumber(draft.cook_minutes, decimalSeparator),
    ingredients: ingredients.length > 0 ? ingredients : [emptyIngredientRow(makeKey())],
    steps: steps.length > 0 ? steps : [emptyStepRow(makeKey())],
  };
}
