import { tooLongProblem } from "@platform/core/utils/tooLongProblem";
import {
  RECIPE_DESCRIPTION_MAX_LENGTH,
  RECIPE_FORM_PROBLEMS as PROBLEMS,
  RECIPE_SERVINGS_MAX_LENGTH,
  RECIPE_SOURCE_MAX_LENGTH,
  RECIPE_TITLE_MAX_LENGTH,
} from "../constants/recipeForm";
import type { DecimalSeparator } from "../types/recipe/decimal-separator";
import type { RecipeFormProblems } from "../types/recipe/recipe-form-problems";
import type { RecipeFormValues } from "../types/recipe/recipe-form-values";
import type { RecipeProblemScope } from "../types/recipe/recipe-problem-scope";
import { recipeContentProblems } from "./recipeContentProblems";

/**
 * What stops a new recipe saving, counted on what is sent (trimmed) and in code points, as the
 * backend's `max_length` counts them.
 */
export function recipeFormProblems(
  values: RecipeFormValues,
  decimalSeparator: DecimalSeparator,
  scope: RecipeProblemScope = {},
): RecipeFormProblems {
  const problems = recipeContentProblems(values, decimalSeparator, scope);
  const title = values.title.trim();
  const titleProblem =
    tooLongProblem(title, RECIPE_TITLE_MAX_LENGTH) ?? (!scope.lengthsOnly && title === "" ? PROBLEMS.titleRequired : undefined);
  const description = tooLongProblem(values.description.trim(), RECIPE_DESCRIPTION_MAX_LENGTH);
  const source = tooLongProblem(values.source.trim(), RECIPE_SOURCE_MAX_LENGTH);
  const servings = tooLongProblem(values.servings.trim(), RECIPE_SERVINGS_MAX_LENGTH);
  if (titleProblem) problems.title = titleProblem;
  if (description) problems.description = description;
  if (source) problems.source = source;
  if (servings) problems.servings = servings;
  return problems;
}
