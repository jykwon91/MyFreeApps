import { useSubmitOnce } from "@myrecipes/api-client/hooks/useSubmitOnce";
import { recipesApi, useCreateRecipeMutation } from "@myrecipes/api-client/store/recipesApi";
import type { RecipeFormValues } from "@myrecipes/api-client/types/recipe/recipe-form-values";
import { buildRecipeCreateRequest } from "@myrecipes/api-client/utils/buildRecipeCreateRequest";
import { emptyIngredientRow, emptyStepRow } from "@myrecipes/api-client/utils/emptyRecipeRows";
import { firstRecipeFormProblem } from "@myrecipes/api-client/utils/firstRecipeFormProblem";
import { newRecipeFormIsDirty } from "@myrecipes/api-client/utils/newRecipeFormIsDirty";
import { recipeWriteErrorMessage } from "@myrecipes/api-client/utils/recipeWriteErrorMessage";
import { recipeFormProblems } from "@myrecipes/api-client/utils/recipeFormProblems";
import { recipeFormValuesFromDraft } from "@myrecipes/api-client/utils/recipeFormValuesFromDraft";
import { deviceDecimalSeparator, useToast } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { NEW_RECIPE_MESSAGES as MESSAGES } from "../../constants/newRecipe";
import type { AppStore } from "../../lib/store";
import type { NewRecipeSeed } from "../../types/NewRecipeSeed";
import { nextRowKey } from "../../utils/nextRowKey";
import { useRecipeRows } from "../recipeForm/useRecipeRows";

type MetaField = Exclude<keyof RecipeFormValues, "ingredients" | "steps">;

function emptyForm(): RecipeFormValues {
  return {
    title: "",
    description: "",
    source: "",
    servings: "",
    prepMinutes: "",
    cookMinutes: "",
    ingredients: [emptyIngredientRow(nextRowKey())],
    steps: [emptyStepRow(nextRowKey())],
  };
}

/**
 * Creating a recipe, as the website's /recipes/new does: the same fields, checks and request.
 * A field past its limit says so as it's typed; the other problems show on their fields once
 * Create has been pressed, and the first is toasted, for sighted users only. Once it's
 * saved, the new recipe replaces this screen, so Back goes to where the form was opened from.
 *
 * With a `seed`, the form starts filled in from its draft, as the website's editor does with a
 * discovered or photographed recipe. A draft that can be opened again loses nothing when left
 * untouched, so only an edit asks first; one that can't (a photo's read) always asks until it's created.
 */
export function useNewRecipeForm(seed?: NewRecipeSeed) {
  const { showToast, showVisualToast } = useToast();
  const dispatch = useDispatch<AppStore["dispatch"]>();
  const [createRecipe, { isLoading: isSaving }] = useCreateRecipeMutation();
  // Amounts and minutes are read in the device locale's decimal separator, and a draft's shown in it.
  const [decimalSeparator] = useState(deviceDecimalSeparator);
  const [initialValues] = useState(() =>
    seed ? recipeFormValuesFromDraft(seed.draft, decimalSeparator, nextRowKey) : emptyForm(),
  );
  const [values, setValues] = useState(initialValues);
  const [hasTried, setHasTried] = useState(false);
  const rows = useRecipeRows(setValues);
  // Where to go once it's saved; the detail screen already has the recipe from the cache.
  const [created, setCreated] = useState<{ id: string } | null>(null);
  const submitOnce = useSubmitOnce();
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Waits a render after saving, or the discard question would still see the unsaved changes.
  const from = seed?.from;
  useEffect(() => {
    if (created) router.replace({ pathname: "/recipes/[id]", params: from ? { ...created, from } : created });
  }, [created, from]);

  // A field past its limit says so as it's typed; what's missing waits for Create.
  const problems = recipeFormProblems(values, decimalSeparator, { lengthsOnly: !hasTried });

  function edit(field: MetaField, text: string): void {
    setValues((current) => ({ ...current, [field]: text }));
  }

  async function save(): Promise<void> {
    setHasTried(true);
    if (created) return;
    const problem = firstRecipeFormProblem(recipeFormProblems(values, decimalSeparator));
    if (problem) {
      // The field errors say it to a screen reader, as one summary; this is for sighted users who can't see the first.
      showVisualToast(problem, "error");
      return;
    }
    await submitOnce(async () => {
      try {
        const recipe = await createRecipe(buildRecipeCreateRequest(values, decimalSeparator)).unwrap();
        // The recipe opens straight away, with no skeleton while it's asked for again.
        dispatch(recipesApi.util.upsertQueryData("getRecipe", recipe.id, recipe));
        seed?.onCreated?.(recipe.id);
        showToast(MESSAGES.created);
        if (isMounted.current) setCreated({ id: recipe.id });
      } catch (error) {
        const message = recipeWriteErrorMessage(error, "create");
        if (message && isMounted.current) showToast(message, "error");
      }
    });
  }

  return {
    values,
    problems,
    rows,
    isSaving,
    isLeaving: created !== null,
    isDirty: newRecipeFormIsDirty(values, initialValues, seed?.origin),
    edit,
    save,
  };
}
