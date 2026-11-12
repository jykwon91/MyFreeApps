import type { DecimalSeparator } from "../types/recipe/decimal-separator";
import type { RecipeVersionFormValues } from "../types/recipe/recipe-version-form-values";
import type { VersionCreateRequest } from "../types/recipe/recipe-requests";
import { ingredientInputs } from "./ingredientInputs";
import { minutesInput } from "./minutesInput";
import { stepInputs } from "./stepInputs";

/** POST /recipes/{id}/versions's body from a tweak's form, trimmed, with lineage keys carried. */
export function buildVersionCreateRequest(
  values: RecipeVersionFormValues,
  changeNote: string,
  baseVersionId: string,
  decimalSeparator: DecimalSeparator,
): VersionCreateRequest {
  return {
    base_version_id: baseVersionId,
    change_note: changeNote.trim(),
    servings: values.servings.trim() || null,
    prep_minutes: minutesInput(values.prepMinutes, decimalSeparator),
    cook_minutes: minutesInput(values.cookMinutes, decimalSeparator),
    ingredients: ingredientInputs(values.ingredients, decimalSeparator),
    steps: stepInputs(values.steps),
  };
}
