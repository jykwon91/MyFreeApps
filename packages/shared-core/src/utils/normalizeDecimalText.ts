import { DECIMAL_TEXT } from "../constants/decimalText";
import type { DecimalSeparator } from "../types/text/decimal-separator";
import type { DecimalTextOptions } from "../types/text/decimal-text-options";

/**
 * A typed decimal that is not money (a rate, a percentage, a GPA, a quantity) as the canonical
 * "11.5" a server reads: "" when blank, undefined when it can't be read for sure.
 *
 * Only digits and one decimal mark are read: the keypad's own (`decimalSeparator`), or "." unless
 * `keypadMarkOnly` says otherwise. On a "." keypad a "," is never read, since there it groups
 * thousands and "1,250" isn't 1.25. Thousands grouping is never read, so two marks, a sign, an
 * exponent, spaces or letters are unreadable.
 *
 * Digits are kept as typed ("2.990" stays "2.990", so an untouched value saves unchanged), apart
 * from leading zeros and the trimming `maxDecimals` allows.
 */
export function normalizeDecimalText(
  text: string,
  decimalSeparator: DecimalSeparator,
  { maxDecimals = Number.POSITIVE_INFINITY, keypadMarkOnly = false }: DecimalTextOptions = {},
): string | undefined {
  const body = text.trim();
  if (body === "") return "";
  const match = DECIMAL_TEXT.exec(body);
  if (!match) return undefined;
  const [, whole, mark, fraction = ""] = match;
  const readsMark = mark === undefined || mark === decimalSeparator || (mark === "." && !keypadMarkOnly);
  if (!readsMark) return undefined;
  if (whole === "" && fraction === "") return undefined;
  if (/[^0]/.test(fraction.slice(maxDecimals))) return undefined;
  const kept = fraction.slice(0, maxDecimals);
  const units = whole.replace(/^0+(?=\d)/, "") || "0";
  return kept === "" ? units : `${units}.${kept}`;
}
