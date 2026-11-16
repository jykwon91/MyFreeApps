import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import { normalizeMoneyText } from "./normalizeMoneyText";

/**
 * Typed or pasted dollars as integer cents: null when blank, undefined when it can't be read for
 * sure (see normalizeMoneyText). Blank is never zero: a blank premium isn't "free".
 */
export function moneyTextToCents(text: string, decimalSeparator: DecimalSeparator): number | null | undefined {
  const amount = normalizeMoneyText(text, decimalSeparator);
  if (amount === undefined) return undefined;
  return amount === "" ? null : Math.round(Number(amount) * 100);
}

/** True for a readable amount with a minus sign in front ("-5", "-1.250,50"), which normalizeMoneyText refuses. */
export function isNegativeMoneyText(text: string, decimalSeparator: DecimalSeparator): boolean {
  if (!/^\s*-/.test(text)) return false;
  const amount = normalizeMoneyText(text.replace(/^\s*-\s*/, ""), decimalSeparator);
  return amount !== undefined && Number(amount) > 0;
}
