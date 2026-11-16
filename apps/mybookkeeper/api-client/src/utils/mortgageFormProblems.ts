import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import type { MortgageFormProblem } from "../types/mortgage/mortgage-form-problem";
import type { MortgageFormProblems } from "../types/mortgage/mortgage-form-problems";
import type { MortgageFormValues } from "../types/mortgage/mortgage-form-values";
import { isNegativeMoneyText, moneyTextToCents } from "./moneyTextToCents";

/** The rate must sit strictly between these, as the server requires. */
const MAX_RATE_PCT = 25;
const MAX_TERM_MONTHS = 600;

type MoneyField =
  | "balanceDollars"
  | "monthlyPrincipalDollars"
  | "monthlyInterestDollars"
  | "monthlyEscrowDollars";

const MONEY_FIELDS: readonly MoneyField[] = [
  "balanceDollars",
  "monthlyPrincipalDollars",
  "monthlyInterestDollars",
  "monthlyEscrowDollars",
];

function parsed(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : Number.NaN;
}

/** Blank is fine; otherwise the amount must be readable and pass `isAllowed` (cents). */
function moneyProblem(
  text: string,
  decimalSeparator: DecimalSeparator,
  isAllowed: (cents: number) => boolean,
  notAllowed: MortgageFormProblem,
): MortgageFormProblem | undefined {
  const cents = moneyTextToCents(text, decimalSeparator);
  if (cents === null) return undefined;
  if (cents === undefined) return isNegativeMoneyText(text, decimalSeparator) ? "negative_amount" : "not_a_number";
  return isAllowed(cents) ? undefined : notAllowed;
}

/**
 * What the server would refuse, found before the request goes out.
 *
 * The same rules as the create and update schemas, so a phone can point at the
 * field instead of showing a failed save. Blank is never a problem here: every
 * number on the form is optional, and a blank is sent as null rather than 0.
 */
export function mortgageFormProblems(values: MortgageFormValues, decimalSeparator: DecimalSeparator): MortgageFormProblems {
  const problems: MortgageFormProblems = {};

  if (values.rateType === "") problems.rateType = "rate_type_required";

  const rate = parsed(values.interestRate);
  if (rate !== null && !(rate > 0 && rate < MAX_RATE_PCT)) problems.interestRate = "rate_out_of_range";

  for (const field of MONEY_FIELDS) {
    const problem = moneyProblem(values[field], decimalSeparator, (cents) => cents >= 0, "not_a_number");
    if (problem) problems[field] = problem;
  }

  const original = moneyProblem(values.originalPrincipalDollars, decimalSeparator, (cents) => cents > 0, "must_be_positive");
  if (original) problems.originalPrincipalDollars = original;

  const term = parsed(values.termMonths);
  if (term !== null && !(term > 0 && term <= MAX_TERM_MONTHS)) problems.termMonths = "term_out_of_range";

  // A balance is only true as of a date, so the server takes both or neither.
  const hasBalance = values.balanceDollars.trim() !== "";
  const hasDate = values.statementDate !== "";
  if (hasBalance && !hasDate) problems.statementDate = "needs_statement_date";
  if (hasDate && !hasBalance && problems.balanceDollars === undefined) problems.balanceDollars = "needs_balance";

  return problems;
}
