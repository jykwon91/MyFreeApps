import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertBox,
  Button,
  FormField,
  LoadingButton,
  showError,
  showSuccess,
} from "@platform/ui";
import IngredientRows from "@/features/recipes/IngredientRows";
import StepRows from "@/features/recipes/StepRows";
import { useRecipeEditorForm } from "@/features/recipes/useRecipeEditorForm";
import {
  useCreateRecipeMutation,
  useCreateVersionMutation,
} from "@myrecipes/api-client/store/recipesApi";
import {
  CHANGE_NOTE_MAX_LENGTH,
  RECIPE_DESCRIPTION_MAX_LENGTH,
  RECIPE_FORM_PROBLEMS,
  RECIPE_SERVINGS_MAX_LENGTH,
  RECIPE_SOURCE_MAX_LENGTH,
  RECIPE_TITLE_MAX_LENGTH,
} from "@myrecipes/api-client/constants/recipeForm";
import { browserDecimalSeparator } from "@/lib/browserDecimalSeparator";
import { buildRecipeCreateRequest } from "@myrecipes/api-client/utils/buildRecipeCreateRequest";
import { firstRecipeFormProblem } from "@myrecipes/api-client/utils/firstRecipeFormProblem";
import { formatRecipeNumber } from "@myrecipes/api-client/utils/formatRecipeNumber";
import { ingredientInputs } from "@myrecipes/api-client/utils/ingredientInputs";
import { minutesInput } from "@myrecipes/api-client/utils/minutesInput";
import { recipeContentProblems } from "@myrecipes/api-client/utils/recipeContentProblems";
import { recipeFormProblems } from "@myrecipes/api-client/utils/recipeFormProblems";
import { stepInputs } from "@myrecipes/api-client/utils/stepInputs";
import type { RecipeExtractionDraft } from "@myrecipes/api-client/types/recipe/extraction";
import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";

interface CreateProps {
  mode: "create";
  /** Pre-fill the form from an AI-extracted photo draft (photo import). */
  initialDraft?: RecipeExtractionDraft;
  /** Override Cancel — e.g. return to the import upload step, not history. */
  onCancel?: () => void;
}

interface TweakProps {
  mode: "tweak";
  recipeId: string;
  /** The version this tweak starts from (its lineage keys seed the form). */
  baseVersion: VersionResponse;
  /** Override Cancel (defaults to navigating back). */
  onCancel?: () => void;
}

type Props = CreateProps | TweakProps;

const META_INPUT =
  "w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 min-h-[44px]";

function buildSeed(base?: VersionResponse, draft?: RecipeExtractionDraft) {
  if (base) return { baseVersion: base };
  if (draft) return { draft };
  return undefined;
}

/**
 * The shared recipe editor form, driven by a discriminated `mode`:
 *   - create: blank recipe-level fields + one empty ingredient/step row.
 *     Submits POST /recipes.
 *   - tweak: recipe-level fields are fixed (the recipe already exists), a
 *     required "what did you change?" note is shown, and rows are prefilled
 *     from `baseVersion` carrying lineage keys. Submits POST /recipes/:id/versions.
 */
export default function RecipeEditorForm(props: Props) {
  const navigate = useNavigate();
  const isTweak = props.mode === "tweak";
  const base = isTweak ? props.baseVersion : undefined;
  const draft = props.mode === "create" ? props.initialDraft : undefined;
  const [decimalSeparator] = useState(browserDecimalSeparator);
  const form = useRecipeEditorForm(buildSeed(base, draft), decimalSeparator);

  const [title, setTitle] = useState(draft?.title ?? "");
  const [description, setDescription] = useState(draft?.description ?? "");
  const [source, setSource] = useState(draft?.source ?? "");
  const [servings, setServings] = useState(draft?.servings ?? base?.servings ?? "");
  const [prep, setPrep] = useState(formatRecipeNumber(draft?.prep_minutes ?? base?.prep_minutes, decimalSeparator));
  const [cook, setCook] = useState(formatRecipeNumber(draft?.cook_minutes ?? base?.cook_minutes, decimalSeparator));
  const [changeNote, setChangeNote] = useState("");

  // The editable form doubles as the review step for photo import. Warn when
  // the extraction came back thin so the user knows to double-check, and if it
  // couldn't read a title, drop focus straight onto the title field.
  const needsReview =
    draft != null &&
    (draft.title.trim() === "" ||
      draft.ingredients.length === 0 ||
      draft.steps.length === 0);

  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (draft != null && draft.title.trim() === "") {
      titleRef.current?.focus();
    }
  }, [draft]);

  const handleCancel = props.onCancel ?? (() => navigate(-1));

  const [createRecipe, { isLoading: isCreating }] = useCreateRecipeMutation();
  const [createVersion, { isLoading: isTweaking }] = useCreateVersionMutation();
  const isSubmitting = isCreating || isTweaking;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const values = {
      title,
      description,
      source,
      servings,
      prepMinutes: prep,
      cookMinutes: cook,
      ingredients: form.ingredients,
      steps: form.steps,
    };
    const problem =
      firstRecipeFormProblem(isTweak ? recipeContentProblems(values, decimalSeparator) : recipeFormProblems(values, decimalSeparator)) ??
      (isTweak && !changeNote.trim() ? RECIPE_FORM_PROBLEMS.changeNoteRequired : undefined);
    if (problem) {
      showError(problem);
      return;
    }

    try {
      if (props.mode === "create") {
        const created = await createRecipe(buildRecipeCreateRequest(values, decimalSeparator)).unwrap();
        showSuccess("Recipe created.");
        navigate(`/recipes/${created.id}`, { replace: true });
      } else {
        await createVersion({
          recipeId: props.recipeId,
          body: {
            base_version_id: props.baseVersion.id,
            change_note: changeNote.trim(),
            servings: servings.trim() || null,
            prep_minutes: minutesInput(prep, decimalSeparator),
            cook_minutes: minutesInput(cook, decimalSeparator),
            ingredients: ingredientInputs(form.ingredients, decimalSeparator),
            steps: stepInputs(form.steps),
          },
        }).unwrap();
        showSuccess("New version saved.");
        navigate(`/recipes/${props.recipeId}`, { replace: true });
      }
    } catch {
      showError(
        isTweak
          ? "Couldn't save this tweak — please try again."
          : "Couldn't create this recipe — please try again.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {needsReview ? (
        <AlertBox variant="warning">
          We filled in what we could from your photo — double-check everything before saving.
        </AlertBox>
      ) : null}
      {isTweak ? (
        <section className="bg-card border rounded-lg p-6 space-y-4">
          <FormField label="What did you change?" required highlight>
            {(field) => (
              <textarea
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                disabled={isSubmitting}
                rows={2}
                maxLength={CHANGE_NOTE_MAX_LENGTH}
                placeholder="e.g. Cut the sugar by half, added vanilla"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                {...field}
              />
            )}
          </FormField>
        </section>
      ) : (
        <section className="bg-card border rounded-lg p-6 space-y-4">
          <FormField label="Title" required>
            {(field) => (
              <input
                ref={titleRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isSubmitting}
                required
                maxLength={RECIPE_TITLE_MAX_LENGTH}
                className={META_INPUT}
                {...field}
              />
            )}
          </FormField>
          <FormField label="Description">
            {(field) => (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSubmitting}
                rows={2}
                maxLength={RECIPE_DESCRIPTION_MAX_LENGTH}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                {...field}
              />
            )}
          </FormField>
          <FormField label="Source">
            {(field) => (
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                disabled={isSubmitting}
                maxLength={RECIPE_SOURCE_MAX_LENGTH}
                placeholder="e.g. grandma, a cookbook, a URL"
                className={META_INPUT}
                {...field}
              />
            )}
          </FormField>
        </section>
      )}

      <section className="bg-card border rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="Servings">
            {(field) => (
              <input
                type="text"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                disabled={isSubmitting}
                maxLength={RECIPE_SERVINGS_MAX_LENGTH}
                placeholder="e.g. 4"
                className={META_INPUT}
                {...field}
              />
            )}
          </FormField>
          <FormField label="Prep (min)">
            {(field) => (
              <input
                inputMode="decimal"
                value={prep}
                onChange={(e) => setPrep(e.target.value)}
                disabled={isSubmitting}
                className={META_INPUT}
                {...field}
              />
            )}
          </FormField>
          <FormField label="Cook (min)">
            {(field) => (
              <input
                inputMode="decimal"
                value={cook}
                onChange={(e) => setCook(e.target.value)}
                disabled={isSubmitting}
                className={META_INPUT}
                {...field}
              />
            )}
          </FormField>
        </div>
      </section>

      <section className="bg-card border rounded-lg p-6 space-y-3">
        <h2 className="text-base font-medium">Ingredients</h2>
        <IngredientRows
          rows={form.ingredients}
          disabled={isSubmitting}
          onChange={form.setIngredient}
          onAdd={form.addIngredient}
          onRemove={form.removeIngredient}
          onMove={form.moveIngredient}
        />
      </section>

      <section className="bg-card border rounded-lg p-6 space-y-3">
        <h2 className="text-base font-medium">Steps</h2>
        <StepRows
          rows={form.steps}
          disabled={isSubmitting}
          onChange={form.setStep}
          onAdd={form.addStep}
          onRemove={form.removeStep}
          onMove={form.moveStep}
        />
      </section>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={handleCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <LoadingButton
          type="submit"
          isLoading={isSubmitting}
          loadingText={isTweak ? "Saving version..." : "Creating..."}
        >
          {isTweak ? "Save new version" : "Create recipe"}
        </LoadingButton>
      </div>
    </form>
  );
}
