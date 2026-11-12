import type { EditableIngredientRow } from "@myrecipes/api-client/types/recipe/editable-ingredient-row";

/** What a recipe form can do to its ingredient and step rows. */
export interface RecipeRowEditing {
  /** The row just added, so its first field can take focus. */
  addedKey: string | null;
  editIngredient: (key: string, patch: Partial<EditableIngredientRow>) => void;
  editStep: (key: string, instruction: string) => void;
  addIngredient: () => void;
  addStep: () => void;
  removeIngredient: (key: string) => void;
  removeStep: (key: string) => void;
  moveIngredient: (key: string, direction: -1 | 1) => void;
  moveStep: (key: string, direction: -1 | 1) => void;
}
