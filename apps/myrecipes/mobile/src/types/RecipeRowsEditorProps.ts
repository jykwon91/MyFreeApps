import type { RecipeFormProblems } from "@myrecipes/api-client/types/recipe/recipe-form-problems";
import type { RecipeRowEditing } from "./RecipeRowEditing";
import type { RecipeRows } from "./RecipeRows";

export interface RecipeRowsEditorProps {
  values: RecipeRows;
  problems: RecipeFormProblems;
  rows: RecipeRowEditing;
  disabled: boolean;
}
