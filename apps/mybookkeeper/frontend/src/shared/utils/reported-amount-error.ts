import { normalizeMoneyText } from "@mybookkeeper/api-client/utils/normalizeMoneyText";
import { MAX_REPORTED_AMOUNT, REPORTED_AMOUNT_MESSAGES } from "@/shared/lib/reported-amount-messages";
import { NUMBER_INPUT_DECIMAL_SEPARATOR } from "@/shared/lib/number-input-decimal-separator";

/**
 * Why a typed 1099 amount can't be saved, or undefined when it can. Unlike a transaction,
 * a 1099 can report $0, but never a negative, sub-cent or more than the column holds.
 */
export function reportedAmountError(value: string): string | undefined {
  const typed = value.trim();
  if (typed === "") return REPORTED_AMOUNT_MESSAGES.blank;
  if (typed.startsWith("-") && Number(typed) < 0) return REPORTED_AMOUNT_MESSAGES.negative;
  const amount = normalizeMoneyText(typed, NUMBER_INPUT_DECIMAL_SEPARATOR);
  if (amount === undefined) return REPORTED_AMOUNT_MESSAGES.notDollarsAndCents(NUMBER_INPUT_DECIMAL_SEPARATOR);
  if (Number(amount) > MAX_REPORTED_AMOUNT) return REPORTED_AMOUNT_MESSAGES.tooLarge;
  return undefined;
}
