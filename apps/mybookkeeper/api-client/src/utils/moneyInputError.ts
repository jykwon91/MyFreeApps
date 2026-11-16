import { MONEY_INPUT_MESSAGES, MONEY_PATTERN } from "../constants/moneyInput";

/** Why a typed dollar amount can't be saved, or undefined when it can. Blank, zero, negative and sub-cent are all refused. */
export function moneyInputError(value: string): string | undefined {
  const amount = value.trim();
  if (amount === "" || Number(amount) === 0) return MONEY_INPUT_MESSAGES.notPositive;
  if (!MONEY_PATTERN.test(amount)) return MONEY_INPUT_MESSAGES.notDollarsAndCents;
  return undefined;
}
