import type { RecipeFormProblems } from "@myrecipes/api-client/types/recipe/recipe-form-problems";
import type { RecipeFormValues } from "@myrecipes/api-client/types/recipe/recipe-form-values";
import type { RecipeTimingField } from "./RecipeTimingField";

export interface RecipeTimingFieldsProps {
  values: Pick<RecipeFormValues, RecipeTimingField>;
  problems: RecipeFormProblems;
  disabled: boolean;
  onEdit: (field: RecipeTimingField, text: string) => void;
}
