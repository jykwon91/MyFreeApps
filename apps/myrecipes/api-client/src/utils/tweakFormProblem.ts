import type { DecimalSeparator } from "../types/recipe/decimal-separator";
import type { RecipeVersionFormValues } from "../types/recipe/recipe-version-form-values";
import { changeNoteProblem } from "./changeNoteProblem";
import { firstRecipeFormProblem } from "./firstRecipeFormProblem";
import { recipeContentProblems } from "./recipeContentProblems";

/** The problem to name first that stops a tweak saving, or undefined when it can be saved. */
export function tweakFormProblem(
  values: RecipeVersionFormValues,
  changeNote: string,
  decimalSeparator: DecimalSeparator,
): string | undefined {
  return firstRecipeFormProblem(recipeContentProblems(values, decimalSeparator)) ?? changeNoteProblem(changeNote);
}
