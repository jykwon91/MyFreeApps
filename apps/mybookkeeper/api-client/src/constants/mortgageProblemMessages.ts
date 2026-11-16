import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import type { MortgageFormProblem } from "../types/mortgage/mortgage-form-problem";

/** What each form problem says to the person, on the web and on the phone alike, with examples in their decimal mark. */
export const mortgageProblemMessages = (decimalSeparator: DecimalSeparator): Record<MortgageFormProblem, string> => ({
  rate_type_required: "Pick whether the rate is fixed or adjustable.",
  rate_out_of_range: `Use a rate above 0 and below 25, like 7${decimalSeparator}125.`,
  rate_decimals: `Use at most three decimal places, like 7${decimalSeparator}125.`,
  not_a_number: "Use dollars and cents, or leave it blank.",
  negative_amount: "An amount can't be negative. Leave it blank if you don't know it.",
  must_be_positive: "Use an amount above 0, or leave it blank.",
  term_out_of_range: "Use a number of months from 1 to 600, or leave it blank.",
  needs_statement_date: "A balance is only true as of a date. Pick the statement date too.",
  needs_balance: "Add the balance that statement showed, or clear the date.",
});
