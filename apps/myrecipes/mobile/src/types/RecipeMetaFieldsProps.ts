import type { RecipeMetaProblems } from "@myrecipes/api-client/types/recipe/recipe-meta-problems";
import type { RecipeMetaValues } from "@myrecipes/api-client/types/recipe/recipe-meta-values";

export interface RecipeMetaFieldsProps {
  values: RecipeMetaValues;
  problems: RecipeMetaProblems;
  disabled: boolean;
  /** Puts the cursor in the title, for a filled-in draft that came without one. */
  focusTitle?: boolean;
  onEdit: (field: keyof RecipeMetaValues, text: string) => void;
}
