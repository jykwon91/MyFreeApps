import type { DecimalSeparator } from "../types/recipe/decimal-separator";

/**
 * A typed quantity or minutes as a number: null when blank, NaN when it can't be read for sure.
 * Only digits with at most one of the locale's decimal mark are read. The other mark is never
 * taken as a thousands separator, since "1,250" may be 1.25 typed in a comma-decimal habit, so
 * it, "1/2", "½" and negatives are problems the form names, never a different number saved.
 */
export function parseRecipeNumber(text: string, decimalSeparator: DecimalSeparator): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const [whole, fraction, ...rest] = trimmed.split(decimalSeparator);
  const digits = /^\d*$/;
  const readable = rest.length === 0 && digits.test(whole) && (fraction === undefined || digits.test(fraction));
  if (!readable || !/\d/.test(trimmed)) return Number.NaN;
  return Number(fraction === undefined ? whole : `${whole}.${fraction}`);
}
