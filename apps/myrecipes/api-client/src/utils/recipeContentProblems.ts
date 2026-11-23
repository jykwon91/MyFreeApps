import { tooLongProblem } from "@platform/core/utils/tooLongProblem";
import {
  RECIPE_FORM_PROBLEMS as PROBLEMS,
  RECIPE_INGREDIENTS_MAX,
  RECIPE_MINUTES_MAX,
  RECIPE_SERVINGS_MAX_LENGTH,
  RECIPE_STEPS_MAX,
  STEP_INSTRUCTION_MAX_LENGTH,
} from "../constants/recipeForm";
import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import type { RecipeFormProblems } from "../types/recipe/recipe-form-problems";
import type { RecipeFormValues } from "../types/recipe/recipe-form-values";
import type { RecipeProblemScope } from "../types/recipe/recipe-problem-scope";
import { ingredientInputs } from "./ingredientInputs";
import { ingredientRowProblems } from "./ingredientRowProblems";
import { minutesInput } from "./minutesInput";
import { recipeNumberProblem } from "./recipeNumberProblem";
import { stepInputs } from "./stepInputs";

type RecipeContent = Pick<RecipeFormValues, "servings" | "prepMinutes" | "cookMinutes" | "ingredients" | "steps">;

/** Minutes are rounded to whole minutes when sent, so "1.5" is fine; the rounded value must fit. */
function minutesProblem(text: string, decimalSeparator: DecimalSeparator): string | undefined {
  const unreadable = recipeNumberProblem(text, decimalSeparator, PROBLEMS.minutesInvalid);
  if (unreadable) return unreadable;
  const minutes = minutesInput(text, decimalSeparator);
  return minutes !== null && minutes > RECIPE_MINUTES_MAX ? PROBLEMS.minutesTooLarge : undefined;
}

/** What stops a version's content saving, for a new recipe and a tweak alike. */
export function recipeContentProblems(
  values: RecipeContent,
  decimalSeparator: DecimalSeparator,
  scope: RecipeProblemScope = {},
): RecipeFormProblems {
  const problems: RecipeFormProblems = { rows: {}, stepRows: {} };

  const servings = tooLongProblem(values.servings.trim(), RECIPE_SERVINGS_MAX_LENGTH);
  if (servings) problems.servings = servings;

  for (const row of values.ingredients) {
    const rowProblems = ingredientRowProblems(row, decimalSeparator, scope);
    if (Object.keys(rowProblems).length > 0) problems.rows[row.key] = rowProblems;
  }
  for (const row of values.steps) {
    const tooLong = tooLongProblem(row.instruction.trim(), STEP_INSTRUCTION_MAX_LENGTH);
    if (tooLong) problems.stepRows[row.key] = tooLong;
  }
  // Counted on the rows that are sent: blank ones are dropped.
  const ingredientCount = ingredientInputs(values.ingredients, decimalSeparator).length;
  const stepCount = stepInputs(values.steps).length;
  if (ingredientCount > RECIPE_INGREDIENTS_MAX) problems.ingredients = PROBLEMS.ingredientsTooMany;
  if (stepCount > RECIPE_STEPS_MAX) problems.steps = PROBLEMS.stepsTooMany;
  if (scope.lengthsOnly) return problems;

  const prep = minutesProblem(values.prepMinutes, decimalSeparator);
  if (prep) problems.prepMinutes = prep;
  const cook = minutesProblem(values.cookMinutes, decimalSeparator);
  if (cook) problems.cookMinutes = cook;
  if (ingredientCount === 0) problems.ingredients = PROBLEMS.ingredientsRequired;
  if (stepCount === 0) problems.steps = PROBLEMS.stepsRequired;
  return problems;
}
