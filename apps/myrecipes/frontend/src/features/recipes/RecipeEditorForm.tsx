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
} from "@/store/recipesApi";
import type { RecipeExtractionDraft } from "@/types/recipe/extraction";
import type { VersionResponse } from "@/types/recipe/version";

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

function minutesToString(minutes: number | null | undefined): string {
  return minutes != null ? String(minutes) : "";
}

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
  const form = useRecipeEditorForm(buildSeed(base, draft));

  const [title, setTitle] = useState(draft?.title ?? "");
  const [description, setDescription] = useState(draft?.description ?? "");
  const [source, setSource] = useState(draft?.source ?? "");
  const [servings, setServings] = useState(draft?.servings ?? base?.servings ?? "");
  const [prep, setPrep] = useState(minutesToString(draft?.prep_minutes ?? base?.prep_minutes));
  const [cook, setCook] = useState(minutesToString(draft?.cook_minutes ?? base?.cook_minutes));
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

  function parseMinutes(value: string): number | null {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const ingredients = form.buildIngredients();
    const steps = form.buildSteps();

    if (!isTweak && !title.trim()) {
      showError("Give your recipe a title.");
      return;
    }
    if (ingredients.length === 0) {
      showError("Add at least one ingredient.");
      return;
    }
    if (steps.length === 0) {
      showError("Add at least one step.");
      return;
    }
    if (isTweak && !changeNote.trim()) {
      showError("Add a note describing what you changed.");
      return;
    }

    try {
      if (props.mode === "create") {
        const created = await createRecipe({
          title: title.trim(),
          description: description.trim() || null,
          source: source.trim() || null,
          servings: servings.trim() || null,
          prep_minutes: parseMinutes(prep),
          cook_minutes: parseMinutes(cook),
          ingredients,
          steps,
        }).unwrap();
        showSuccess("Recipe created.");
        navigate(`/recipes/${created.id}`, { replace: true });
      } else {
        await createVersion({
          recipeId: props.recipeId,
          body: {
            base_version_id: props.baseVersion.id,
            change_note: changeNote.trim(),
            servings: servings.trim() || null,
            prep_minutes: parseMinutes(prep),
            cook_minutes: parseMinutes(cook),
            ingredients,
            steps,
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
            <textarea
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              disabled={isSubmitting}
              rows={2}
              maxLength={2000}
              placeholder="e.g. Cut the sugar by half, added vanilla"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
          </FormField>
        </section>
      ) : (
        <section className="bg-card border rounded-lg p-6 space-y-4">
          <FormField label="Title" required>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
              required
              maxLength={255}
              className={META_INPUT}
            />
          </FormField>
          <FormField label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              rows={2}
              maxLength={5000}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
          </FormField>
          <FormField label="Source">
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              disabled={isSubmitting}
              maxLength={1000}
              placeholder="e.g. grandma, a cookbook, a URL"
              className={META_INPUT}
            />
          </FormField>
        </section>
      )}

      <section className="bg-card border rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="Servings">
            <input
              type="text"
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              disabled={isSubmitting}
              maxLength={50}
              placeholder="e.g. 4"
              className={META_INPUT}
            />
          </FormField>
          <FormField label="Prep (min)">
            <input
              type="number"
              min={0}
              value={prep}
              onChange={(e) => setPrep(e.target.value)}
              disabled={isSubmitting}
              className={META_INPUT}
            />
          </FormField>
          <FormField label="Cook (min)">
            <input
              type="number"
              min={0}
              value={cook}
              onChange={(e) => setCook(e.target.value)}
              disabled={isSubmitting}
              className={META_INPUT}
            />
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
