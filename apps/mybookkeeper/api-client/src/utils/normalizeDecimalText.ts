import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import { DECIMAL_TEXT } from "../constants/decimalInput";

/**
 * A typed decimal that is not money (a rate, a percentage) as the canonical "11.5" the server
 * reads: "" when blank, undefined when it can't be read for sure.
 *
 * Only digits and one decimal mark are read: the device's own, or "." — which is how the server
 * sends these values back, so a form prefilled with "7.125" still saves on a decimal-comma phone.
 * On a "." keypad a "," is never read, since there it groups thousands and "1,250" isn't 1.25.
 * These numbers are small (a rate under 25, a percentage up to 100, cents under 1000), so nothing
 * is ever read as thousands grouping, and two marks, a sign, an exponent or letters are unreadable.
 *
 * Digits are kept as typed ("2.990" stays "2.990", so an untouched value saves unchanged), except
 * that zeros past `maxDecimals` are dropped ("2.500" → "2.50" for two); any other digit past it
 * makes the text unreadable rather than rounded. Leave `maxDecimals` out to read any number.
 */
export function normalizeDecimalText(
  text: string,
  decimalSeparator: DecimalSeparator,
  maxDecimals: number = Number.POSITIVE_INFINITY,
): string | undefined {
  const body = text.trim();
  if (body === "") return "";
  const match = DECIMAL_TEXT.exec(body);
  if (!match) return undefined;
  const [, whole, mark, fraction = ""] = match;
  if (mark !== undefined && mark !== "." && mark !== decimalSeparator) return undefined;
  if (whole === "" && fraction === "") return undefined;
  if (/[^0]/.test(fraction.slice(maxDecimals))) return undefined;
  const kept = fraction.slice(0, maxDecimals);
  const units = whole.replace(/^0+(?=\d)/, "") || "0";
  return kept === "" ? units : `${units}.${kept}`;
}
