import type { DecimalSeparator } from "../types/recipe/decimal-separator";

/** A stored quantity or minutes as the form shows it, in the user's decimal separator; blank for none. */
export function formatRecipeNumber(value: number | null | undefined, decimalSeparator: DecimalSeparator): string {
  return value == null ? "" : String(value).replace(".", decimalSeparator);
}
