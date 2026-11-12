import { RECIPE_FORM_PROBLEMS as PROBLEMS } from "../constants/recipeForm";
import type { DecimalSeparator } from "../types/recipe/decimal-separator";
import { parseRecipeNumber } from "./parseRecipeNumber";

/**
 * Why a typed number can't be read, or undefined if it can. Text with the other locale's mark
 * gets the hint for this locale's decimals; anything else gets `unreadable`.
 */
export function recipeNumberProblem(text: string, decimalSeparator: DecimalSeparator, unreadable: string): string | undefined {
  if (!Number.isNaN(parseRecipeNumber(text, decimalSeparator))) return undefined;
  const otherMark = decimalSeparator === "." ? "," : ".";
  return text.includes(otherMark) ? PROBLEMS.decimalSeparatorHint(decimalSeparator) : unreadable;
}
