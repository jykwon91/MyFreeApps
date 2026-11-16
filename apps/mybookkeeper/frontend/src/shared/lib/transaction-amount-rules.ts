import type { RegisterOptions } from "react-hook-form";
import { moneyInputError } from "@mybookkeeper/api-client/utils/moneyInputError";
import type { TransactionFormValues } from "@/shared/types/transaction/transaction-form-values";

/**
 * The amount rule for every web transaction form, checked by react-hook-form itself.
 * The input's own min/step only apply to a native form submit, and the panel's
 * Save & Approve and Save & close buttons don't submit natively.
 */
export const TRANSACTION_AMOUNT_RULES = {
  validate: (value: string) => moneyInputError(value) ?? true,
} satisfies RegisterOptions<TransactionFormValues, "amount">;
