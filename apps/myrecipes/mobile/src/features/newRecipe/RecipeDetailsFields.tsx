import type { RecipeFormProblems } from "@myrecipes/api-client/types/recipe/recipe-form-problems";
import type { RecipeFormValues } from "@myrecipes/api-client/types/recipe/recipe-form-values";
import { useFieldChain } from "@platform/mobile";
import type { RecipeDetailField } from "../../types/RecipeDetailField";
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
  const fields = useFieldChain<RecipeDetailField>(["title", "description", "source", "servings", "prepMinutes", "cookMinutes"]);
  return (
    <>
      <RecipeMetaFields disabled={disabled} fields={fields} focusTitle={focusTitle} onEdit={onEdit} problems={problems} values={values} />
      <RecipeTimingFields disabled={disabled} fields={fields} onEdit={onEdit} problems={problems} values={values} />
    </>
  );
}
