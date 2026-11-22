import type { RecipeFormValues } from "../types/recipe/recipe-form-values";

/** True when anything at all has been typed into a blank new-recipe form. */
export function recipeFormHasText(values: RecipeFormValues): boolean {
  const { ingredients, steps, ...meta } = values;
  const texts = [
    ...Object.values(meta),
    ...ingredients.flatMap((row) => [row.name, row.quantity, row.unit, row.note]),
    ...steps.map((row) => row.instruction),
  ];
  return texts.some((text) => text.trim() !== "");
}
