import type { RecipeFormValues } from "./recipe-form-values";

/**
 * What a version holds, as the editor types it: everything but the recipe's own title, description
 * and source, which a tweak leaves alone.
 */
export type RecipeVersionFormValues = Pick<RecipeFormValues, "servings" | "prepMinutes" | "cookMinutes" | "ingredients" | "steps">;
