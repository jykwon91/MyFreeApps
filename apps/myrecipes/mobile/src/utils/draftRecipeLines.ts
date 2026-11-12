import type { RecipeExtractionDraft } from "@myrecipes/api-client/types/recipe/extraction";
import type { DraftRecipeLines } from "../types/DraftRecipeLines";

/** A draft's ingredients and steps as the recipe lists show them, in the order the page gave. */
export function draftRecipeLines(draft: Pick<RecipeExtractionDraft, "ingredients" | "steps">): DraftRecipeLines {
  return {
    ingredients: draft.ingredients.map((ingredient, index) => ({ ...ingredient, id: `ingredient-${index}`, position: index })),
    steps: draft.steps.map((step, index) => ({ id: `step-${index}`, position: index, instruction: step.instruction })),
  };
}
