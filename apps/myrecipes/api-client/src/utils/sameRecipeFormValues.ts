import { sameFormValues } from "@platform/core/utils/sameFormValues";
import type { RecipeVersionFormValues } from "../types/recipe/recipe-version-form-values";

function sameRows<Row extends object>(a: readonly Row[], b: readonly Row[]): boolean {
  return a.length === b.length && a.every((row, index) => sameFormValues(row, b[index]));
}

/**
 * True when two recipe forms hold the same thing: every field, and the same rows in the same
 * order. A row added, removed or moved counts as a change, even an empty one.
 */
export function sameRecipeFormValues<Values extends RecipeVersionFormValues>(a: Values, b: Values): boolean {
  const { ingredients: aIngredients, steps: aSteps, ...aFields } = a;
  const { ingredients: bIngredients, steps: bSteps, ...bFields } = b;
  return (
    sameFormValues(aFields, bFields) && sameRows(aIngredients, bIngredients) && sameRows(aSteps, bSteps)
  );
}
