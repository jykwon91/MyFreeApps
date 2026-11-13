import { tooLongProblem } from "@platform/core/utils/tooLongProblem";
import {
  RECIPE_DESCRIPTION_MAX_LENGTH,
  RECIPE_FORM_PROBLEMS as PROBLEMS,
  RECIPE_SOURCE_MAX_LENGTH,
  RECIPE_TITLE_MAX_LENGTH,
} from "../constants/recipeForm";
import type { RecipeMetaProblems } from "../types/recipe/recipe-meta-problems";
import type { RecipeMetaValues } from "../types/recipe/recipe-meta-values";
import type { RecipeProblemScope } from "../types/recipe/recipe-problem-scope";

/**
 * What stops a recipe's title, description and source saving, counted on what is sent (trimmed)
 * and in code points, as the backend's `max_length` counts them. The title is required.
 */
export function recipeMetaProblems(values: RecipeMetaValues, scope: RecipeProblemScope = {}): RecipeMetaProblems {
  const problems: RecipeMetaProblems = {};
  const title = values.title.trim();
  const titleProblem =
    tooLongProblem(title, RECIPE_TITLE_MAX_LENGTH) ?? (!scope.lengthsOnly && title === "" ? PROBLEMS.titleRequired : undefined);
  const description = tooLongProblem(values.description.trim(), RECIPE_DESCRIPTION_MAX_LENGTH);
  const source = tooLongProblem(values.source.trim(), RECIPE_SOURCE_MAX_LENGTH);
  if (titleProblem) problems.title = titleProblem;
  if (description) problems.description = description;
  if (source) problems.source = source;
  return problems;
}
