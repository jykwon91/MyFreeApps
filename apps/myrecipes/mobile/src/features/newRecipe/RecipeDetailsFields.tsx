import type { RecipeFormProblems } from "@myrecipes/api-client/types/recipe/recipe-form-problems";
import type { RecipeFormValues } from "@myrecipes/api-client/types/recipe/recipe-form-values";
import RecipeMetaFields from "../recipeForm/RecipeMetaFields";
import RecipeTimingFields from "../recipeForm/RecipeTimingFields";

type MetaField = Exclude<keyof RecipeFormValues, "ingredients" | "steps">;

interface RecipeDetailsFieldsProps {
  values: RecipeFormValues;
  problems: RecipeFormProblems;
  disabled: boolean;
  /** Puts the cursor in the title, for a filled-in draft that came without one. */
  focusTitle?: boolean;
  onEdit: (field: MetaField, text: string) => void;
}

/** The recipe's own fields: title, description, source, servings and times, as on the website. */
export default function RecipeDetailsFields({ values, problems, disabled, focusTitle, onEdit }: RecipeDetailsFieldsProps) {
  return (
    <>
      <RecipeMetaFields disabled={disabled} focusTitle={focusTitle} onEdit={onEdit} problems={problems} values={values} />
      <RecipeTimingFields disabled={disabled} onEdit={onEdit} problems={problems} values={values} />
    </>
  );
}
