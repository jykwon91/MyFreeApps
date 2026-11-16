import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import { MAX_REPORTED_AMOUNT, REPORTED_AMOUNT_MESSAGES } from "../constants/reportedAmount";
import { normalizeMoneyText } from "./normalizeMoneyText";

/**
 * Why a typed 1099 amount can't be saved, or undefined when it can. Unlike a transaction,
 * a 1099 can report $0, but never a negative, sub-cent or more than the column holds.
 */
export function reportedAmountError(value: string, decimalSeparator: DecimalSeparator): string | undefined {
  const typed = value.trim();
  if (typed === "") return REPORTED_AMOUNT_MESSAGES.blank;
  if (typed.startsWith("-") && normalizeMoneyText(typed.slice(1), decimalSeparator)) return REPORTED_AMOUNT_MESSAGES.negative;
  const amount = normalizeMoneyText(typed, decimalSeparator);
  if (amount === undefined) return REPORTED_AMOUNT_MESSAGES.notDollarsAndCents(decimalSeparator);
  if (Number(amount) > MAX_REPORTED_AMOUNT) return REPORTED_AMOUNT_MESSAGES.tooLarge;
  return undefined;
}
