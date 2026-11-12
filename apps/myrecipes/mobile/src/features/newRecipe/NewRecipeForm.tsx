import { Banner, LoadingButton, useDiscardPrompt } from "@platform/mobile";
import { NEW_RECIPE_MESSAGES as MESSAGES } from "../../constants/newRecipe";
import type { NewRecipeSeed } from "../../types/NewRecipeSeed";
import { draftNotice } from "../../utils/draftNotice";
import RecipeDetailsFields from "./RecipeDetailsFields";
import RecipeFormLayout from "../recipeForm/RecipeFormLayout";
import RecipeRowsEditor from "../recipeForm/RecipeRowsEditor";
import { useNewRecipeForm } from "./useNewRecipeForm";

/** The new-recipe form: the recipe's fields, its ingredients and steps, then Create. */
export default function NewRecipeForm({ seed }: { seed?: NewRecipeSeed }) {
  const form = useNewRecipeForm(seed);
  const locked = form.isSaving || form.isLeaving;
  useDiscardPrompt(form.isDirty && !form.isLeaving, form.isSaving);
  const notice = seed ? draftNotice(seed) : null;

  return (
    <RecipeFormLayout testID="new-recipe">
      {notice ? <Banner message={notice.message} tone={notice.tone} /> : null}
      <RecipeDetailsFields
        disabled={locked}
        focusTitle={seed != null && seed.draft.title.trim() === ""}
        onEdit={form.edit}
        problems={form.problems}
        values={form.values}
      />
      <RecipeRowsEditor disabled={locked} problems={form.problems} rows={form.rows} values={form.values} />
      <LoadingButton disabled={form.isLeaving} isLoading={form.isSaving} loadingText={MESSAGES.creating} onPress={form.save}>
        {MESSAGES.create}
      </LoadingButton>
    </RecipeFormLayout>
  );
}
