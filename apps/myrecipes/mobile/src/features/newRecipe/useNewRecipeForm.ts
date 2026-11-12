import { recipesApi, useCreateRecipeMutation } from "@myrecipes/api-client/store/recipesApi";
import type { EditableIngredientRow } from "@myrecipes/api-client/types/recipe/editable-ingredient-row";
import type { RecipeFormValues } from "@myrecipes/api-client/types/recipe/recipe-form-values";
import { buildRecipeCreateRequest } from "@myrecipes/api-client/utils/buildRecipeCreateRequest";
import { emptyIngredientRow, emptyStepRow } from "@myrecipes/api-client/utils/emptyRecipeRows";
import { firstRecipeFormProblem } from "@myrecipes/api-client/utils/firstRecipeFormProblem";
import { moveRow } from "@myrecipes/api-client/utils/moveRow";
import { recipeFormProblems } from "@myrecipes/api-client/utils/recipeFormProblems";
import { useToast } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { NEW_RECIPE_MESSAGES as MESSAGES } from "../../constants/newRecipe";
import type { AppStore } from "../../lib/store";
import { deviceDecimalSeparator } from "../../utils/deviceDecimalSeparator";
import { nextRowKey } from "../../utils/nextRowKey";

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
 * saved, the new recipe replaces this screen, so Back goes to the list.
 */
export function useNewRecipeForm() {
  const { showToast } = useToast();
  const dispatch = useDispatch<AppStore["dispatch"]>();
  const [createRecipe, { isLoading: isSaving }] = useCreateRecipeMutation();
  const [values, setValues] = useState(emptyForm);
  // Amounts and minutes are read in the device locale's decimal separator.
  const [decimalSeparator] = useState(deviceDecimalSeparator);
  const [hasTried, setHasTried] = useState(false);
  // The row just added, so its first field can take focus.
  const [addedKey, setAddedKey] = useState<string | null>(null);
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
  useEffect(() => {
    if (created) router.replace({ pathname: "/recipes/[id]", params: created });
  }, [created]);

  // A field past its limit says so as it's typed; what's missing waits for Create.
  const problems = recipeFormProblems(values, decimalSeparator, { lengthsOnly: !hasTried });

  function edit(field: MetaField, text: string): void {
    setValues((current) => ({ ...current, [field]: text }));
  }

  function editIngredient(key: string, patch: Partial<EditableIngredientRow>): void {
    setValues((current) => ({
      ...current,
      ingredients: current.ingredients.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    }));
  }

  function editStep(key: string, instruction: string): void {
    setValues((current) => ({
      ...current,
      steps: current.steps.map((row) => (row.key === key ? { ...row, instruction } : row)),
    }));
  }

  function addIngredient(): void {
    const row = emptyIngredientRow(nextRowKey());
    setAddedKey(row.key);
    setValues((current) => ({ ...current, ingredients: [...current.ingredients, row] }));
  }

  function addStep(): void {
    const row = emptyStepRow(nextRowKey());
    setAddedKey(row.key);
    setValues((current) => ({ ...current, steps: [...current.steps, row] }));
  }

  function removeIngredient(key: string): void {
    setValues((current) => ({ ...current, ingredients: current.ingredients.filter((row) => row.key !== key) }));
  }

  function removeStep(key: string): void {
    setValues((current) => ({ ...current, steps: current.steps.filter((row) => row.key !== key) }));
  }

  function moveIngredient(key: string, direction: -1 | 1): void {
    setValues((current) => ({ ...current, ingredients: moveRow(current.ingredients, key, direction) }));
  }

  function moveStep(key: string, direction: -1 | 1): void {
    setValues((current) => ({ ...current, steps: moveRow(current.steps, key, direction) }));
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
      showToast(MESSAGES.created);
      if (isMounted.current) setCreated({ id: recipe.id, title: recipe.title, owner: recipe.owner_display_name });
    } catch {
      if (isMounted.current) showToast(MESSAGES.couldntCreate, "error");
    }
  }

  return {
    values,
    problems,
    addedKey,
    isSaving,
    isLeaving: created !== null,
    isDirty: hasText(values),
    edit,
    editIngredient,
    editStep,
    addIngredient,
    addStep,
    removeIngredient,
    removeStep,
    moveIngredient,
    moveStep,
    save,
  };
}
