import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";

export interface EditRecipeMetaDialogProps {
  recipe: RecipeDetailResponse;
  onClose: () => void;
  /** Where focus goes once the dialog has closed. */
  onCloseAutoFocus: (event: Event) => void;
}
