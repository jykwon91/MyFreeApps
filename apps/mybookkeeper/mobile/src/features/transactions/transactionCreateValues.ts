import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import { NONE_CHOICE } from "../../constants/transactionCreateOptions";
import { DEFAULT_CATEGORY, NONE_OPTION_VALUE } from "../../constants/transactionEdit";
import { isoFromDate } from "../../lib/localDate";
import type { TransactionChoice } from "../../types/TransactionChoice";
import type { TransactionCreateValues } from "../../types/TransactionCreateValues";
import { moneyInputError } from "@mybookkeeper/api-client/utils/moneyInputError";
import { normalizeMoneyText } from "@mybookkeeper/api-client/utils/normalizeMoneyText";
import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import { taxYearOf } from "@mybookkeeper/api-client/utils/transactionTaxYear";

/** What the website opens its form with: today, an expense, maintenance. */
export function blankCreateValues(today: Date): TransactionCreateValues {
  return {
    date: isoFromDate(today),
    type: "expense",
    amount: "",
    vendor: "",
    description: "",
    category: DEFAULT_CATEGORY.expense,
    propertyId: null,
    channel: "",
    paymentMethod: "",
    taxRelevant: false,
  };
}

export function createAmountError(values: TransactionCreateValues, decimalSeparator: DecimalSeparator): string | undefined {
  return moneyInputError(values.amount, decimalSeparator);
}

/**
 * The same body the website sends: the tax year follows the date, and empty fields go as null.
 * The amount goes as "1234.56" however it was typed; one createAmountError refuses never gets here.
 */
export function createPayload(values: TransactionCreateValues, decimalSeparator: DecimalSeparator): Partial<Transaction> {
  return {
    transaction_date: values.date,
    tax_year: taxYearOf(values.date),
    vendor: values.vendor.trim() || null,
    description: values.description.trim() || null,
    amount: normalizeMoneyText(values.amount, decimalSeparator) ?? "",
    transaction_type: values.type,
    category: values.category,
    property_id: values.propertyId,
    tax_relevant: values.taxRelevant,
    channel: values.channel || null,
    payment_method: values.paymentMethod || null,
    is_manual: true,
  };
}

export function choiceLabel(choices: readonly TransactionChoice[], value: string): string {
  return choices.find((choice) => choice.value === (value || NONE_OPTION_VALUE))?.label ?? NONE_CHOICE.label;
}

/** A pick from a sheet as a form keeps it: the "none" choice is empty. */
export function fromChoice(value: string): string {
  return value === NONE_OPTION_VALUE ? "" : value;
}
