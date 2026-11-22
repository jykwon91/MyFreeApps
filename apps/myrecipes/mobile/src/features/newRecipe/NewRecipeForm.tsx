import { Banner, confirmDiscard, LoadingButton, useConfirmLeave } from "@platform/mobile";
import { CHOOSE_AGAIN_DISCARD_COPY, DRAFT_DISCARD_COPY, NEW_RECIPE_MESSAGES as MESSAGES } from "../../constants/newRecipe";
import type { NewRecipeFormProps } from "../../types/NewRecipeFormProps";
import { draftNotice } from "../../utils/draftNotice";
import RecipeDetailsFields from "./RecipeDetailsFields";
import RecipeFormLayout from "../recipeForm/RecipeFormLayout";
import RecipeRowsEditor from "../recipeForm/RecipeRowsEditor";
import { useNewRecipeForm } from "./useNewRecipeForm";

/** The new-recipe form: the recipe's fields, its ingredients and steps, then Create. */
export default function NewRecipeForm({ seed, onChooseAgain }: NewRecipeFormProps) {
  const form = useNewRecipeForm(seed);
  const locked = form.isSaving || form.isLeaving;
  // A save in flight can't be walked away from.
  useConfirmLeave(form.isDirty && !form.isLeaving, (leave) => {
    if (!form.isSaving) confirmDiscard(leave, seed ? DRAFT_DISCARD_COPY[seed.origin] : undefined);
  });
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
      {onChooseAgain ? (
        <LoadingButton
          disabled={locked}
          onPress={() => confirmDiscard(onChooseAgain, CHOOSE_AGAIN_DISCARD_COPY)}
          variant="secondary"
        >
          {MESSAGES.chooseDifferentPhoto}
        </LoadingButton>
      ) : null}
    </RecipeFormLayout>
  );
}
