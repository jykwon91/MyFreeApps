import type { RecipeVersionFormValues } from "../types/recipe/recipe-version-form-values";
import { sameRecipeFormValues } from "./sameRecipeFormValues";

/** Whether leaving a tweak would lose anything: its values have changed, or a change note was typed. */
export function tweakFormIsDirty<Values extends RecipeVersionFormValues>(
  values: Values,
  initialValues: Values,
  changeNote: string,
): boolean {
  return changeNote !== "" || !sameRecipeFormValues(values, initialValues);
}
