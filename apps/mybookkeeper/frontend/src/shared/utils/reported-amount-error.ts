import { MONEY_PATTERN } from "@mybookkeeper/api-client/constants/moneyInput";
import { MAX_REPORTED_AMOUNT, REPORTED_AMOUNT_MESSAGES } from "@/shared/lib/reported-amount-messages";

/**
 * Why a typed 1099 amount can't be saved, or undefined when it can. Unlike a transaction,
 * a 1099 can report $0, but never a negative, sub-cent or more than the column holds.
 */
export function reportedAmountError(value: string): string | undefined {
  const amount = value.trim();
  if (amount === "") return REPORTED_AMOUNT_MESSAGES.blank;
  if (amount.startsWith("-") && Number(amount) < 0) return REPORTED_AMOUNT_MESSAGES.negative;
  if (!MONEY_PATTERN.test(amount)) return REPORTED_AMOUNT_MESSAGES.notDollarsAndCents;
  if (Number(amount) > MAX_REPORTED_AMOUNT) return REPORTED_AMOUNT_MESSAGES.tooLarge;
  return undefined;
}
