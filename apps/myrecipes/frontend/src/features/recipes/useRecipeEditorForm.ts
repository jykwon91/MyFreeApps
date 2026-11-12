import { useState } from "react";
import type { EditableIngredientRow } from "@myrecipes/api-client/types/recipe/editable-ingredient-row";
import type { EditableStepRow } from "@myrecipes/api-client/types/recipe/editable-step-row";
import type { DecimalSeparator } from "@myrecipes/api-client/types/recipe/decimal-separator";
import { draftIngredientRows, draftStepRows } from "@myrecipes/api-client/utils/draftFormRows";
import { emptyIngredientRow, emptyStepRow } from "@myrecipes/api-client/utils/emptyRecipeRows";
import { formatRecipeNumber } from "@myrecipes/api-client/utils/formatRecipeNumber";
import { moveRow } from "@myrecipes/api-client/utils/moveRow";
import type { RecipeExtractionDraft } from "@myrecipes/api-client/types/recipe/extraction";
import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";

function makeKey(): string {
  return crypto.randomUUID();
}

function emptyIngredient(): EditableIngredientRow {
  return emptyIngredientRow(makeKey());
}

function emptyStep(): EditableStepRow {
  return emptyStepRow(makeKey());
}

/**
 * Seed editor rows from a base version, CARRYING each ingredient's lineage_key
 * so a tweak's diff tracks "same ingredient, changed". New (create) editors
 * start with one empty ingredient row and one empty step row.
 */
function ingredientsFromVersion(version: VersionResponse, decimalSeparator: DecimalSeparator): EditableIngredientRow[] {
  return version.ingredients.map((ing) => ({
    key: makeKey(),
    name: ing.name,
    quantity: formatRecipeNumber(ing.quantity, decimalSeparator),
    unit: ing.unit ?? "",
    note: ing.note ?? "",
    lineageKey: ing.lineage_key,
  }));
}

function stepsFromVersion(version: VersionResponse): EditableStepRow[] {
  return version.steps.map((s) => ({ key: makeKey(), instruction: s.instruction }));
}

/**
 * How the editor rows are seeded:
 *   - baseVersion (tweak): copy an existing version forward, carrying lineage keys.
 *   - draft (photo import): pre-fill from an AI-extracted draft, no lineage keys.
 *   - neither (create): one empty ingredient row and one empty step row.
 */
export interface EditorSeed {
  baseVersion?: VersionResponse;
  draft?: RecipeExtractionDraft;
}

export interface RecipeEditorFormState {
  ingredients: EditableIngredientRow[];
  steps: EditableStepRow[];
  setIngredient: (key: string, patch: Partial<EditableIngredientRow>) => void;
  addIngredient: () => void;
  removeIngredient: (key: string) => void;
  moveIngredient: (key: string, direction: -1 | 1) => void;
  setStep: (key: string, instruction: string) => void;
  addStep: () => void;
  removeStep: (key: string) => void;
  moveStep: (key: string, direction: -1 | 1) => void;
}

/**
 * Owns the editable ingredient/step row state for the recipe editor. The rows
 * are seeded from the `seed` argument: a base version (tweak, lineage keys
 * carried), an extracted draft (photo import, no lineage keys), or — when
 * absent (create) — one blank row of each. Quantities are shown in `decimalSeparator`,
 * the one the form reads them back in.
 */
export function useRecipeEditorForm(seed: EditorSeed | undefined, decimalSeparator: DecimalSeparator): RecipeEditorFormState {
  const { baseVersion, draft } = seed ?? {};
  const [ingredients, setIngredients] = useState<EditableIngredientRow[]>(() => {
    if (baseVersion) return ingredientsFromVersion(baseVersion, decimalSeparator);
    if (draft && draft.ingredients.length > 0) return draftIngredientRows(draft.ingredients, decimalSeparator, makeKey);
    return [emptyIngredient()];
  });
  const [steps, setSteps] = useState<EditableStepRow[]>(() => {
    if (baseVersion) return stepsFromVersion(baseVersion);
    if (draft && draft.steps.length > 0) return draftStepRows(draft.steps, makeKey);
    return [emptyStep()];
  });

  function setIngredient(key: string, patch: Partial<EditableIngredientRow>) {
    setIngredients((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function setStep(key: string, instruction: string) {
    setSteps((prev) =>
      prev.map((row) => (row.key === key ? { ...row, instruction } : row)),
    );
  }

  return {
    ingredients,
    steps,
    setIngredient,
    addIngredient: () => setIngredients((prev) => [...prev, emptyIngredient()]),
    removeIngredient: (key) =>
      setIngredients((prev) => prev.filter((row) => row.key !== key)),
    moveIngredient: (key, direction) =>
      setIngredients((prev) => moveRow(prev, key, direction)),
    setStep,
    addStep: () => setSteps((prev) => [...prev, emptyStep()]),
    removeStep: (key) => setSteps((prev) => prev.filter((row) => row.key !== key)),
    moveStep: (key, direction) => setSteps((prev) => moveRow(prev, key, direction)),
  };
}
