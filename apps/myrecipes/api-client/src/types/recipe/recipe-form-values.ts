import type { EditableIngredientRow } from "./editable-ingredient-row";
import type { EditableStepRow } from "./editable-step-row";

/** Everything the new-recipe form holds, as typed. Minutes are text so the fields can be empty. */
export interface RecipeFormValues {
  title: string;
  description: string;
  source: string;
  servings: string;
  prepMinutes: string;
  cookMinutes: string;
  ingredients: EditableIngredientRow[];
  steps: EditableStepRow[];
}
