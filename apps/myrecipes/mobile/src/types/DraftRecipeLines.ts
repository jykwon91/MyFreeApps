import type { RecipeIngredientLine } from "./RecipeIngredientLine";
import type { RecipeStepLine } from "./RecipeStepLine";

export interface DraftRecipeLines {
  ingredients: RecipeIngredientLine[];
  steps: RecipeStepLine[];
}
