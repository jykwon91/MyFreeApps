import { RECIPE_MANAGE_MESSAGES } from "@myrecipes/api-client/constants/recipeManage";
import { recipesApi, useUpdateRecipeMutation } from "@myrecipes/api-client/store/recipesApi";
import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";
import type { RecipeMetaValues } from "@myrecipes/api-client/types/recipe/recipe-meta-values";
import { buildRecipeUpdateRequest } from "@myrecipes/api-client/utils/buildRecipeUpdateRequest";
import { recipeMetaProblems } from "@myrecipes/api-client/utils/recipeMetaProblems";
import { recipeMetaValues } from "@myrecipes/api-client/utils/recipeMetaValues";
import { useToast } from "@platform/mobile";
import { useState } from "react";
import { useDispatch } from "react-redux";
import type { AppStore } from "../../lib/store";

/**
 * Editing a recipe's title, description and source, as the website's Edit dialog does: the same
 * checks and request. A field past its limit says so as it's typed; a missing title waits for Save.
 * A failed save says so at the top of the sheet and keeps what was typed.
 */
export function useEditRecipeForm(recipe: RecipeDetailResponse, onSaved: () => void) {
  const { showToast } = useToast();
  const dispatch = useDispatch<AppStore["dispatch"]>();
  const [updateRecipe, { isLoading: isSaving }] = useUpdateRecipeMutation();
  const [values, setValues] = useState(() => recipeMetaValues(recipe));
  const [hasTried, setHasTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const problems = recipeMetaProblems(values, { lengthsOnly: !hasTried });

  function edit(field: keyof RecipeMetaValues, text: string): void {
    setValues((current) => ({ ...current, [field]: text }));
  }

  async function save(): Promise<void> {
    setHasTried(true);
    if (isSaving || Object.keys(recipeMetaProblems(values)).length > 0) return;
    setFailure(null);
    try {
      const updated = await updateRecipe({ recipeId: recipe.id, body: buildRecipeUpdateRequest(values) }).unwrap();
      // The new title shows as the sheet closes, not after the recipe is asked for again.
      dispatch(recipesApi.util.upsertQueryData("getRecipe", updated.id, updated));
      onSaved();
      showToast(RECIPE_MANAGE_MESSAGES.updated);
    } catch {
      setFailure(RECIPE_MANAGE_MESSAGES.couldntUpdate);
    }
  }

  return { values, problems, failure, isSaving, edit, save };
}
