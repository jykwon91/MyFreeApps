import { moneyInputError } from "@mybookkeeper/api-client/utils/moneyInputError";
import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";

/** What's wrong with a typed rent or charge amount, named once something is typed: an empty field just keeps Save off. */
export function rentAmountProblem(amount: string, decimalSeparator: DecimalSeparator): string | undefined {
  return amount === "" ? undefined : moneyInputError(amount, decimalSeparator);
}
