import type { RecipeMetaProblems } from "@myrecipes/api-client/types/recipe/recipe-meta-problems";
import type { RecipeMetaValues } from "@myrecipes/api-client/types/recipe/recipe-meta-values";
import type { FieldChain } from "@platform/mobile";
import type { RecipeDetailField } from "./RecipeDetailField";

export interface RecipeMetaFieldsProps {
  values: RecipeMetaValues;
  problems: RecipeMetaProblems;
  disabled: boolean;
  /** Puts the cursor in the title, for a filled-in draft that came without one. */
  focusTitle?: boolean;
  onEdit: (field: keyof RecipeMetaValues, text: string) => void;
  /** The form's fields, so Return moves through these and on to any that follow. */
  fields: FieldChain<RecipeDetailField>;
}
