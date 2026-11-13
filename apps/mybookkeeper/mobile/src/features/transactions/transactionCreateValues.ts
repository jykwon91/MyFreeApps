import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import { DEFAULT_CATEGORY, NO_PROPERTY_OPTION } from "../../constants/transactionEdit";
import { isoFromDate } from "../../lib/localDate";
import type { TransactionChoice } from "../../types/TransactionChoice";
import type { TransactionCreateValues } from "../../types/TransactionCreateValues";
import { moneyInputError } from "./transactionEditValues";
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

export function createAmountError(values: TransactionCreateValues): string | undefined {
  return moneyInputError(values.amount.trim());
}

/** The same body the website sends: the tax year follows the date, and empty fields go as null. */
export function createPayload(values: TransactionCreateValues): Partial<Transaction> {
  return {
    transaction_date: values.date,
    tax_year: taxYearOf(values.date),
    vendor: values.vendor.trim() || null,
    description: values.description.trim() || null,
    amount: values.amount.trim(),
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
  return choices.find((choice) => choice.value === (value || NO_PROPERTY_OPTION))?.label ?? "None";
}

/** A pick from a sheet as a form keeps it: the "none" choice is empty. */
export function fromChoice(value: string): string {
  return value === NO_PROPERTY_OPTION ? "" : value;
}
