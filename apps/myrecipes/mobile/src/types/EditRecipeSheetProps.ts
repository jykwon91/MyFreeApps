import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";

export interface EditRecipeSheetProps {
  /** The recipe as saved, which the form starts from. */
  recipe: RecipeDetailResponse;
  /** Closes the sheet: after a save, or on Cancel. */
  onClose: () => void;
}
