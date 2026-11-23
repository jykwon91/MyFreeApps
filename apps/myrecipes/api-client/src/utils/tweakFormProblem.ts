import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import type { RecipeVersionFormValues } from "../types/recipe/recipe-version-form-values";
import { changeNoteProblem } from "./changeNoteProblem";
import { firstRecipeFormProblem } from "./firstRecipeFormProblem";
import { recipeContentProblems } from "./recipeContentProblems";

/** The problem to name first that stops a tweak saving, in form order (the change note is on top), or undefined when it can be saved. */
export function tweakFormProblem(
  values: RecipeVersionFormValues,
  changeNote: string,
  decimalSeparator: DecimalSeparator,
): string | undefined {
  return changeNoteProblem(changeNote) ?? firstRecipeFormProblem(recipeContentProblems(values, decimalSeparator));
}
