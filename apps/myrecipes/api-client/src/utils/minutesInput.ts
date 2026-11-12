import type { DecimalSeparator } from "../types/recipe/decimal-separator";
import { parseRecipeNumber } from "./parseRecipeNumber";

/** Typed minutes as the API takes them: rounded, or null when blank (or not a number). */
export function minutesInput(text: string, decimalSeparator: DecimalSeparator): number | null {
  const minutes = parseRecipeNumber(text, decimalSeparator);
  return minutes === null || Number.isNaN(minutes) ? null : Math.round(minutes);
}
