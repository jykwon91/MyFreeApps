import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertBox,
  Button,
  LoadingButton,
  UnsavedChangesDialog,
  showError,
  showSuccess,
  useUnsavedChangesGuard,
} from "@platform/ui";
import { DISCARD_MESSAGES } from "@platform/core/constants/discard";
import type { DiscardCopy } from "@platform/core/types/discard/discard-copy";
import ProblemFormField from "@/features/recipes/ProblemFormField";
import IngredientRows from "@/features/recipes/IngredientRows";
import StepRows from "@/features/recipes/StepRows";
import { useRecipeEditorForm } from "@/features/recipes/useRecipeEditorForm";
import { useSubmitOnce } from "@myrecipes/api-client/hooks/useSubmitOnce";
import {
  useCreateRecipeMutation,
  useCreateVersionMutation,
} from "@myrecipes/api-client/store/recipesApi";
import {
  CHANGE_NOTE_MAX_LENGTH,
  RECIPE_DESCRIPTION_MAX_LENGTH,
  RECIPE_SERVINGS_MAX_LENGTH,
  RECIPE_SOURCE_MAX_LENGTH,
  RECIPE_TITLE_MAX_LENGTH,
} from "@myrecipes/api-client/constants/recipeForm";
import { browserDecimalSeparator } from "@/lib/browserDecimalSeparator";
import { DRAFT_DISCARD_COPY } from "@myrecipes/api-client/constants/recipeDiscard";
import { TWEAK_MESSAGES } from "@myrecipes/api-client/constants/tweak";
import { buildRecipeCreateRequest } from "@myrecipes/api-client/utils/buildRecipeCreateRequest";
import { buildVersionCreateRequest } from "@myrecipes/api-client/utils/buildVersionCreateRequest";
import { changeNoteProblem } from "@myrecipes/api-client/utils/changeNoteProblem";
import { firstRecipeFormProblem } from "@myrecipes/api-client/utils/firstRecipeFormProblem";
import { draftNeedsReview } from "@myrecipes/api-client/utils/draftNeedsReview";
import { formatRecipeNumber } from "@myrecipes/api-client/utils/formatRecipeNumber";
import { newRecipeFormIsDirty } from "@myrecipes/api-client/utils/newRecipeFormIsDirty";
import { recipeFormProblems } from "@myrecipes/api-client/utils/recipeFormProblems";
import { recipeWriteErrorMessage } from "@myrecipes/api-client/utils/recipeWriteErrorMessage";
import { tweakFormIsDirty } from "@myrecipes/api-client/utils/tweakFormIsDirty";
import { recipeContentProblems } from "@myrecipes/api-client/utils/recipeContentProblems";
import { tweakFormProblem } from "@myrecipes/api-client/utils/tweakFormProblem";
import type { DraftSeed } from "@myrecipes/api-client/types/recipe/draft-seed";
import type { RecipeFormProblems } from "@myrecipes/api-client/types/recipe/recipe-form-problems";
import type { RecipeExtractionDraft } from "@myrecipes/api-client/types/recipe/extraction";
import type { RecipeFormValues } from "@myrecipes/api-client/types/recipe/recipe-form-values";
import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";

interface CreateProps {
  mode: "create";
  /** Pre-fill the form from a draft read from a photo or a web page, for review. */
  seed?: DraftSeed;
  /** Override Cancel — e.g. return to the import upload step, not history. */
  onCancel?: () => void;
  /** What Cancel asks when it would lose something, if not what leaving asks. */
  cancelCopy?: DiscardCopy;
  /** Told the new recipe's id once it's created, before the form leaves for it. */
  onCreated?: (recipeId: string) => void;
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
  const seed = props.mode === "create" ? props.seed : undefined;
  const draft = seed?.draft;
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
  const needsReview = draft != null && draftNeedsReview(draft);


  const [createRecipe, { isLoading: isCreating }] = useCreateRecipeMutation();
  const [createVersion, { isLoading: isTweaking }] = useCreateVersionMutation();
  const isSubmitting = isCreating || isTweaking;
  const submitOnce = useSubmitOnce();

  const values: RecipeFormValues = {
    title,
    description,
    source,
    servings,
    prepMinutes: prep,
    cookMinutes: cook,
    ingredients: form.ingredients,
    steps: form.steps,
  };
  const [initialValues] = useState(values);

  // A field past its limit says so as it's typed; what's missing waits for the first save attempt.
  const [hasTried, setHasTried] = useState(false);
  const scope = { lengthsOnly: !hasTried };
  const problems: RecipeFormProblems = isTweak
    ? recipeContentProblems(values, decimalSeparator, scope)
    : recipeFormProblems(values, decimalSeparator, scope);
  const noteProblem = isTweak ? changeNoteProblem(changeNote, scope) : undefined;
  // Bumped on each save attempt that finds problems, to move focus to the first invalid field once they render.
  const [rejectedSaves, setRejectedSaves] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (rejectedSaves === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [rejectedSaves]);

  // Keyed on the draft the form started from, not the `seed` prop: a page may rebuild that
  // object on every render, and refocusing Title each time would pull focus out of other fields.
  const [startsWithoutTitle] = useState(draft != null && draft.title.trim() === "");
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (startsWithoutTitle) titleRef.current?.focus();
  }, [startsWithoutTitle]);
  const isDirty = isTweak
    ? tweakFormIsDirty(values, initialValues, changeNote)
    : newRecipeFormIsDirty(values, initialValues, seed?.origin);
  const guard = useUnsavedChangesGuard(isDirty, { isBusy: isSubmitting });
  // Cancel can ask its own question (a photo's review goes back to choosing a photo).
  const [isCancelAsked, setIsCancelAsked] = useState(false);
  const leaveCopy = seed ? DRAFT_DISCARD_COPY[seed.origin] : DISCARD_MESSAGES;
  const askCopy = isCancelAsked && props.mode === "create" && props.cancelCopy ? props.cancelCopy : leaveCopy;

  function handleCancel() {
    if (isDirty) setIsCancelAsked(true);
    guard.requestLeave(props.onCancel ?? (() => navigate(-1)));
  }

  function handleKeepEditing() {
    setIsCancelAsked(false);
    guard.keepEditing();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const problem = isTweak
      ? tweakFormProblem(values, changeNote, decimalSeparator)
      : firstRecipeFormProblem(recipeFormProblems(values, decimalSeparator));
    setHasTried(true);
    if (problem) {
      showError(problem);
      setRejectedSaves((count) => count + 1);
      return;
    }

    await submitOnce(async () => {
      try {
        if (props.mode === "create") {
          const created = await createRecipe(buildRecipeCreateRequest(values, decimalSeparator)).unwrap();
          props.onCreated?.(created.id);
          showSuccess("Recipe created.");
          guard.leaveWithoutAsking(() => navigate(`/recipes/${created.id}`, { replace: true }));
        } else {
          await createVersion({
            recipeId: props.recipeId,
            body: buildVersionCreateRequest(values, changeNote, props.baseVersion.id, decimalSeparator),
          }).unwrap();
          showSuccess(TWEAK_MESSAGES.saved);
          guard.leaveWithoutAsking(() => navigate(`/recipes/${props.recipeId}`, { replace: true }));
        }
      } catch (error) {
        const message = recipeWriteErrorMessage(error, isTweak ? "tweak" : "create");
        if (message) showError(message);
      }
    });
  }

  return (
    <>
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-6">
        {needsReview ? (
          <AlertBox variant="warning">
            We filled in what we could from your photo — double-check everything before saving.
          </AlertBox>
        ) : null}
        {isTweak ? (
          <section className="bg-card border rounded-lg p-6 space-y-4">
            <ProblemFormField label="What did you change?" error={noteProblem} required highlight>
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
            </ProblemFormField>
          </section>
        ) : (
          <section className="bg-card border rounded-lg p-6 space-y-4">
            <ProblemFormField label="Title" error={problems.title} required>
              {(field) => (
                <input
                  ref={titleRef}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isSubmitting}
                  maxLength={RECIPE_TITLE_MAX_LENGTH}
                  className={META_INPUT}
                  {...field}
                />
              )}
            </ProblemFormField>
            <ProblemFormField label="Description" error={problems.description}>
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
            </ProblemFormField>
            <ProblemFormField label="Source" error={problems.source}>
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
            </ProblemFormField>
          </section>
        )}

        <section className="bg-card border rounded-lg p-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ProblemFormField label="Servings" error={problems.servings}>
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
            </ProblemFormField>
            <ProblemFormField label="Prep (min)" error={problems.prepMinutes}>
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
            </ProblemFormField>
            <ProblemFormField label="Cook (min)" error={problems.cookMinutes}>
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
            </ProblemFormField>
          </div>
        </section>

        <section className="bg-card border rounded-lg p-6 space-y-3">
          <h2 className="text-base font-medium">Ingredients</h2>
          <IngredientRows
            rows={form.ingredients}
            problems={problems.rows}
            listProblem={problems.ingredients}
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
            problems={problems.stepRows}
            listProblem={problems.steps}
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
      <UnsavedChangesDialog
        open={guard.isAsking}
        copy={askCopy}
        onKeepEditing={handleKeepEditing}
        onDiscard={guard.discard}
      />
    </>
  );
}
