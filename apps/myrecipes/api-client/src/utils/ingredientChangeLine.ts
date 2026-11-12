import type { IngredientChange } from "../types/recipe/diff";
import { formatIngredientLine } from "./formatIngredientLine";

/** One side of an ingredient change as a line, or null on the side where it doesn't exist. */
export function ingredientChangeLine(change: IngredientChange, side: "before" | "after"): string | null {
  const snapshot = change[side];
  return snapshot ? formatIngredientLine(snapshot) : null;
}
