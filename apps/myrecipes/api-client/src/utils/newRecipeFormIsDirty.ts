import { DRAFT_CAN_BE_REBUILT } from "../constants/recipeDiscard";
import type { DraftOrigin } from "../types/recipe/draft-origin";
import type { RecipeFormValues } from "../types/recipe/recipe-form-values";
import { recipeFormHasText } from "./recipeFormHasText";
import { sameRecipeFormValues } from "./sameRecipeFormValues";

/**
 * Whether leaving the new-recipe form would lose anything, so it should ask first. A blank form
 * asks once anything is typed. One filled in from a draft asks once it's edited, or always when
 * the draft can't be rebuilt (a photo's read): see `DRAFT_CAN_BE_REBUILT`.
 */
export function newRecipeFormIsDirty(
  values: RecipeFormValues,
  initialValues: RecipeFormValues,
  draftOrigin?: DraftOrigin,
): boolean {
  if (!draftOrigin) return recipeFormHasText(values);
  return !DRAFT_CAN_BE_REBUILT[draftOrigin] || !sameRecipeFormValues(values, initialValues);
}
