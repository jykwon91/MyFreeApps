import { recipesApi, useCreateRecipeMutation } from "@myrecipes/api-client/store/recipesApi";
import type { RecipeFormValues } from "@myrecipes/api-client/types/recipe/recipe-form-values";
import { buildRecipeCreateRequest } from "@myrecipes/api-client/utils/buildRecipeCreateRequest";
import { emptyIngredientRow, emptyStepRow } from "@myrecipes/api-client/utils/emptyRecipeRows";
import { firstRecipeFormProblem } from "@myrecipes/api-client/utils/firstRecipeFormProblem";
import { recipeFormProblems } from "@myrecipes/api-client/utils/recipeFormProblems";
import { recipeFormValuesFromDraft } from "@myrecipes/api-client/utils/recipeFormValuesFromDraft";
import { useToast } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { NEW_RECIPE_MESSAGES as MESSAGES } from "../../constants/newRecipe";
import type { AppStore } from "../../lib/store";
import type { NewRecipeSeed } from "../../types/NewRecipeSeed";
import { deviceDecimalSeparator } from "../../utils/deviceDecimalSeparator";
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

function hasText(values: RecipeFormValues): boolean {
  const { ingredients, steps, ...meta } = values;
  const texts = [
    ...Object.values(meta),
    ...ingredients.flatMap((row) => [row.name, row.quantity, row.unit, row.note]),
    ...steps.map((row) => row.instruction),
  ];
  return texts.some((text) => text.trim() !== "");
}

/**
 * Creating a recipe, as the website's /recipes/new does: the same fields, checks and request.
 * A field past its limit says so as it's typed; the other problems show on their fields once
 * Create has been pressed, and the first is toasted. Once it's
 * saved, the new recipe replaces this screen, so Back goes to where the form was opened from.
 *
 * With a `seed`, the form starts filled in from its draft, as the website's editor does with a
 * discovered or photographed recipe. Leaving it untouched loses nothing, so only an edit asks first.
 */
export function useNewRecipeForm(seed?: NewRecipeSeed) {
  const { showToast } = useToast();
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
  // Where to go once it's saved: the detail screen opens with these while it loads.
  const [created, setCreated] = useState<{ id: string; title: string; owner: string } | null>(null);
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
    if (isSaving || created) return;
    const problem = firstRecipeFormProblem(recipeFormProblems(values, decimalSeparator));
    if (problem) {
      showToast(problem, "error");
      return;
    }
    try {
      const recipe = await createRecipe(buildRecipeCreateRequest(values, decimalSeparator)).unwrap();
      // The recipe opens straight away, with no skeleton while it's asked for again.
      dispatch(recipesApi.util.upsertQueryData("getRecipe", recipe.id, recipe));
      seed?.onCreated?.(recipe.id);
      showToast(MESSAGES.created);
      if (isMounted.current) setCreated({ id: recipe.id, title: recipe.title, owner: recipe.owner_display_name });
    } catch {
      if (isMounted.current) showToast(MESSAGES.couldntCreate, "error");
    }
  }

  return {
    values,
    problems,
    rows,
    isSaving,
    isLeaving: created !== null,
    isDirty: seed ? values !== initialValues : hasText(values),
    edit,
    save,
  };
}
