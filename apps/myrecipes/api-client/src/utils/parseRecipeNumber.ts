import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import { normalizeDecimalText } from "@platform/core/utils/normalizeDecimalText";

/**
 * A typed quantity or minutes as a number: null when blank, NaN when it can't be read for sure.
 * Only digits with at most one of the locale's decimal mark are read. The other mark is never
 * read, as a decimal or as a thousands separator: "1,250" may be 1.25 typed in a comma-decimal
 * habit and "1.500" may be 1500 grams, so it, "1/2", "½" and negatives are problems the form
 * names, never a different number saved.
 */
export function parseRecipeNumber(text: string, decimalSeparator: DecimalSeparator): number | null {
  const normalized = normalizeDecimalText(text, decimalSeparator, { keypadMarkOnly: true });
  if (normalized === "") return null;
  return normalized === undefined ? Number.NaN : Number(normalized);
}
