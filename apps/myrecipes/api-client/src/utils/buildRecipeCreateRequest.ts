import type { DecimalSeparator } from "../types/recipe/decimal-separator";
import type { RecipeCreateRequest } from "../types/recipe/recipe-requests";
import type { RecipeFormValues } from "../types/recipe/recipe-form-values";
import { ingredientInputs } from "./ingredientInputs";
import { minutesInput } from "./minutesInput";
import { stepInputs } from "./stepInputs";

/** POST /recipes's body from the form, trimmed, with blank optional fields sent as null. */
export function buildRecipeCreateRequest(values: RecipeFormValues, decimalSeparator: DecimalSeparator): RecipeCreateRequest {
  return {
    title: values.title.trim(),
    description: values.description.trim() || null,
    source: values.source.trim() || null,
    servings: values.servings.trim() || null,
    prep_minutes: minutesInput(values.prepMinutes, decimalSeparator),
    cook_minutes: minutesInput(values.cookMinutes, decimalSeparator),
    ingredients: ingredientInputs(values.ingredients, decimalSeparator),
    steps: stepInputs(values.steps),
  };
}
