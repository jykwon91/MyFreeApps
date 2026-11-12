import type { EditableIngredientRow } from "../types/recipe/editable-ingredient-row";
import type { EditableStepRow } from "../types/recipe/editable-step-row";

// Keys come from the caller: web and phone make unique ids differently.
export function emptyIngredientRow(key: string): EditableIngredientRow {
  return { key, name: "", quantity: "", unit: "", note: "", lineageKey: null };
}

export function emptyStepRow(key: string): EditableStepRow {
  return { key, instruction: "" };
}
