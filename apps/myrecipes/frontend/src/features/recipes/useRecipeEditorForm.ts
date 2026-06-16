import { useState } from "react";
import type {
  EditableIngredientRow,
  EditableStepRow,
} from "@/features/recipes/editor-types";
import type { IngredientInput } from "@/types/recipe/ingredient";
import type { StepInput } from "@/types/recipe/step";
import type { VersionResponse } from "@/types/recipe/version";

function makeKey(): string {
  return crypto.randomUUID();
}

function emptyIngredient(): EditableIngredientRow {
  return { key: makeKey(), name: "", quantity: "", unit: "", note: "", lineageKey: null };
}

function emptyStep(): EditableStepRow {
  return { key: makeKey(), instruction: "" };
}

/**
 * Seed editor rows from a base version, CARRYING each ingredient's lineage_key
 * so a tweak's diff tracks "same ingredient, changed". New (create) editors
 * start with one empty ingredient row and one empty step row.
 */
function ingredientsFromVersion(version: VersionResponse): EditableIngredientRow[] {
  return version.ingredients.map((ing) => ({
    key: makeKey(),
    name: ing.name,
    quantity: ing.quantity === null ? "" : String(ing.quantity),
    unit: ing.unit ?? "",
    note: ing.note ?? "",
    lineageKey: ing.lineage_key,
  }));
}

function stepsFromVersion(version: VersionResponse): EditableStepRow[] {
  return version.steps.map((s) => ({ key: makeKey(), instruction: s.instruction }));
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
  /** Non-empty ingredient rows mapped to the API input shape. */
  buildIngredients: () => IngredientInput[];
  /** Non-empty step rows mapped to the API input shape. */
  buildSteps: () => StepInput[];
}

function move<T extends { key: string }>(rows: T[], key: string, direction: -1 | 1): T[] {
  const idx = rows.findIndex((r) => r.key === key);
  if (idx < 0) return rows;
  const target = idx + direction;
  if (target < 0 || target >= rows.length) return rows;
  const next = [...rows];
  [next[idx], next[target]] = [next[target], next[idx]];
  return next;
}

/**
 * Owns the editable ingredient/step row state for the recipe editor. When a
 * `baseVersion` is supplied (tweak mode) rows are seeded from it, lineage keys
 * included; otherwise the form starts with one blank row of each.
 */
export function useRecipeEditorForm(baseVersion?: VersionResponse): RecipeEditorFormState {
  const [ingredients, setIngredients] = useState<EditableIngredientRow[]>(() =>
    baseVersion ? ingredientsFromVersion(baseVersion) : [emptyIngredient()],
  );
  const [steps, setSteps] = useState<EditableStepRow[]>(() =>
    baseVersion ? stepsFromVersion(baseVersion) : [emptyStep()],
  );

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

  function buildIngredients(): IngredientInput[] {
    return ingredients
      .filter((row) => row.name.trim().length > 0)
      .map((row) => {
        const quantity = row.quantity.trim();
        const parsed = quantity === "" ? null : Number(quantity);
        return {
          name: row.name.trim(),
          quantity: parsed !== null && Number.isFinite(parsed) ? parsed : null,
          unit: row.unit.trim() || null,
          note: row.note.trim() || null,
          lineage_key: row.lineageKey,
        };
      });
  }

  function buildSteps(): StepInput[] {
    return steps
      .filter((row) => row.instruction.trim().length > 0)
      .map((row) => ({ instruction: row.instruction.trim() }));
  }

  return {
    ingredients,
    steps,
    setIngredient,
    addIngredient: () => setIngredients((prev) => [...prev, emptyIngredient()]),
    removeIngredient: (key) =>
      setIngredients((prev) => prev.filter((row) => row.key !== key)),
    moveIngredient: (key, direction) =>
      setIngredients((prev) => move(prev, key, direction)),
    setStep,
    addStep: () => setSteps((prev) => [...prev, emptyStep()]),
    removeStep: (key) => setSteps((prev) => prev.filter((row) => row.key !== key)),
    moveStep: (key, direction) => setSteps((prev) => move(prev, key, direction)),
    buildIngredients,
    buildSteps,
  };
}
