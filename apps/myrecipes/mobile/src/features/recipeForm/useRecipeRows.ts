import type { EditableIngredientRow } from "@myrecipes/api-client/types/recipe/editable-ingredient-row";
import { emptyIngredientRow, emptyStepRow } from "@myrecipes/api-client/utils/emptyRecipeRows";
import { moveRow } from "@myrecipes/api-client/utils/moveRow";
import { type Dispatch, type SetStateAction, useState } from "react";
import type { RecipeRowEditing } from "../../types/RecipeRowEditing";
import type { RecipeRows } from "../../types/RecipeRows";
import { nextRowKey } from "../../utils/nextRowKey";

/**
 * Adding, editing, reordering and removing a recipe form's ingredient and step rows, in whatever
 * state holds them: the new-recipe form's and a tweak's alike. A row keeps its lineage key however
 * it moves, so a tweak's diff still tracks it.
 */
export function useRecipeRows<T extends RecipeRows>(setValues: Dispatch<SetStateAction<T>>): RecipeRowEditing {
  const [addedKey, setAddedKey] = useState<string | null>(null);

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

  // A move past either end changes nothing, so the form stays as it was and isn't made unsaved.
  function moveIngredient(key: string, direction: -1 | 1): void {
    setValues((current) => {
      const ingredients = moveRow(current.ingredients, key, direction);
      return ingredients === current.ingredients ? current : { ...current, ingredients };
    });
  }

  function moveStep(key: string, direction: -1 | 1): void {
    setValues((current) => {
      const steps = moveRow(current.steps, key, direction);
      return steps === current.steps ? current : { ...current, steps };
    });
  }

  return { addedKey, editIngredient, editStep, addIngredient, addStep, removeIngredient, removeStep, moveIngredient, moveStep };
}
