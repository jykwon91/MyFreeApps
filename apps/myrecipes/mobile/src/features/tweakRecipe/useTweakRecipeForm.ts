import { TWEAK_MESSAGES } from "@myrecipes/api-client/constants/tweak";
import { recipesApi, useCreateVersionMutation } from "@myrecipes/api-client/store/recipesApi";
import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";
import { buildVersionCreateRequest } from "@myrecipes/api-client/utils/buildVersionCreateRequest";
import { changeNoteProblem } from "@myrecipes/api-client/utils/changeNoteProblem";
import { recipeContentProblems } from "@myrecipes/api-client/utils/recipeContentProblems";
import { recipeFormValuesFromVersion } from "@myrecipes/api-client/utils/recipeFormValuesFromVersion";
import { tweakErrorMessage } from "@myrecipes/api-client/utils/tweakErrorMessage";
import { tweakFormProblem } from "@myrecipes/api-client/utils/tweakFormProblem";
import { useToast } from "@platform/mobile";
import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import type { AppStore } from "../../lib/store";
import type { RecipeTimingField } from "../../types/RecipeTimingField";
import { deviceDecimalSeparator } from "../../utils/deviceDecimalSeparator";
import { leaveToRecipe } from "../../utils/leaveToRecipe";
import { nextRowKey } from "../../utils/nextRowKey";
import { useRecipeRows } from "../recipeForm/useRecipeRows";

/**
 * Tweaking a recipe into a new version, as the website's /recipes/:id/tweak does: the form starts
 * from `version` with each ingredient's lineage key carried, a note says what changed, and the same
 * checks and request follow. Problems show as the new-recipe form shows them. Once it's saved, the
 * recipe already shows the new version, and Back returns to it.
 *
 * The screen is keyed by account, so another account signing in unmounts this, and a save that
 * answers after that is dropped. A ref, not state, says a save is under way, so two taps before a
 * re-render can't both send one.
 */
export function useTweakRecipeForm(recipeId: string, version: VersionResponse) {
  const { showToast } = useToast();
  const dispatch = useDispatch<AppStore["dispatch"]>();
  const [createVersion, { isLoading: isSaving }] = useCreateVersionMutation();
  // Amounts and minutes are read in the device locale's decimal separator, and the version's shown in it.
  const [decimalSeparator] = useState(deviceDecimalSeparator);
  const [initialValues] = useState(() => recipeFormValuesFromVersion(version, decimalSeparator, nextRowKey));
  const [values, setValues] = useState(initialValues);
  const [changeNote, setChangeNote] = useState("");
  const [hasTried, setHasTried] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const rows = useRecipeRows(setValues);
  const isSending = useRef(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Waits a render after saving, or the discard question would still see the unsaved changes.
  useEffect(() => {
    if (isSaved) leaveToRecipe(recipeId);
  }, [isSaved, recipeId]);

  // A field past its limit says so as it's typed; what's missing waits for Save.
  const scope = { lengthsOnly: !hasTried };
  const problems = recipeContentProblems(values, decimalSeparator, scope);
  const noteProblem = changeNoteProblem(changeNote, scope);

  function edit(field: RecipeTimingField, text: string): void {
    setValues((current) => ({ ...current, [field]: text }));
  }

  async function save(): Promise<void> {
    setHasTried(true);
    if (isSending.current || isSaved) return;
    const problem = tweakFormProblem(values, changeNote, decimalSeparator);
    if (problem) {
      showToast(problem, "error");
      return;
    }
    isSending.current = true;
    try {
      const body = buildVersionCreateRequest(values, changeNote, version.id, decimalSeparator);
      const created = await createVersion({ recipeId, body }).unwrap();
      if (!isMounted.current) return;
      // The recipe shows the new version straight away, while it's asked for again.
      dispatch(
        recipesApi.util.updateQueryData("getRecipe", recipeId, (recipe) => {
          recipe.latest_version = created;
          recipe.latest_version_number = created.version_number;
          recipe.version_count = created.version_number;
        }),
      );
      showToast(TWEAK_MESSAGES.saved);
      setIsSaved(true);
    } catch (error) {
      // Only a failure can be tried again; a saved tweak is on its way out.
      isSending.current = false;
      if (isMounted.current) showToast(tweakErrorMessage(error), "error");
    }
  }

  return {
    values,
    changeNote,
    problems,
    noteProblem,
    rows,
    isSaving,
    isLeaving: isSaved,
    isDirty: values !== initialValues || changeNote !== "",
    edit,
    setChangeNote,
    save,
  };
}
