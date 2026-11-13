import type { DecimalSeparator } from "../types/recipe/decimal-separator";
import type { RecipeFormProblems } from "../types/recipe/recipe-form-problems";
import type { RecipeFormValues } from "../types/recipe/recipe-form-values";
import type { RecipeProblemScope } from "../types/recipe/recipe-problem-scope";
import { recipeContentProblems } from "./recipeContentProblems";
import { recipeMetaProblems } from "./recipeMetaProblems";

/**
 * What stops a new recipe saving, counted on what is sent (trimmed) and in code points, as the
 * backend's `max_length` counts them.
 */
export function recipeFormProblems(
  values: RecipeFormValues,
  decimalSeparator: DecimalSeparator,
  scope: RecipeProblemScope = {},
): RecipeFormProblems {
  return { ...recipeContentProblems(values, decimalSeparator, scope), ...recipeMetaProblems(values, scope) };
}
