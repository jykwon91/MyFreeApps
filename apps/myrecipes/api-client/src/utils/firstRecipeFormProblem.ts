import type { RecipeFormProblems } from "../types/recipe/recipe-form-problems";

/** The problem to name first, top of the form down, or undefined when the form can be saved. */
export function firstRecipeFormProblem(problems: RecipeFormProblems): string | undefined {
  const row = Object.values(problems.rows)[0];
  return (
    problems.title ??
    problems.description ??
    problems.source ??
    problems.servings ??
    problems.prepMinutes ??
    problems.cookMinutes ??
    problems.ingredients ??
    row?.name ??
    row?.quantity ??
    row?.unit ??
    row?.note ??
    problems.steps ??
    Object.values(problems.stepRows)[0]
  );
}
