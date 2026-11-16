import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import { MONEY_INPUT_MESSAGES } from "../constants/moneyInput";
import { normalizeMoneyText } from "./normalizeMoneyText";

/**
 * Why a typed dollar amount can't be saved, or undefined when it can. Blank, zero, negative,
 * sub-cent and anything normalizeMoneyText can't read for sure are all refused.
 */
export function moneyInputError(value: string, decimalSeparator: DecimalSeparator): string | undefined {
  const amount = normalizeMoneyText(value, decimalSeparator);
  if (amount === undefined) return MONEY_INPUT_MESSAGES.notDollarsAndCents(decimalSeparator);
  if (amount === "" || Number(amount) === 0) return MONEY_INPUT_MESSAGES.notPositive;
  return undefined;
}
