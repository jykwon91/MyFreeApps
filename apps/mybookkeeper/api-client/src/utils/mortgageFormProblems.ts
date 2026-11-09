import type { MortgageFormProblems } from "../types/mortgage/mortgage-form-problems";
import type { MortgageFormValues } from "../types/mortgage/mortgage-form-values";

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

/**
 * What the server would refuse, found before the request goes out.
 *
 * The same rules as the create and update schemas, so a phone can point at the
 * field instead of showing a failed save. Blank is never a problem here: every
 * number on the form is optional, and a blank is sent as null rather than 0.
 */
export function mortgageFormProblems(values: MortgageFormValues): MortgageFormProblems {
  const problems: MortgageFormProblems = {};

  if (values.rateType === "") problems.rateType = "rate_type_required";

  const rate = parsed(values.interestRate);
  if (rate !== null && !(rate > 0 && rate < MAX_RATE_PCT)) problems.interestRate = "rate_out_of_range";

  for (const field of MONEY_FIELDS) {
    const amount = parsed(values[field]);
    if (amount !== null && !(amount >= 0)) problems[field] = "not_a_number";
  }

  const original = parsed(values.originalPrincipalDollars);
  if (original !== null && !(original > 0)) problems.originalPrincipalDollars = "must_be_positive";

  const term = parsed(values.termMonths);
  if (term !== null && !(term > 0 && term <= MAX_TERM_MONTHS)) problems.termMonths = "term_out_of_range";

  // A balance is only true as of a date, so the server takes both or neither.
  const hasBalance = values.balanceDollars.trim() !== "";
  const hasDate = values.statementDate !== "";
  if (hasBalance && !hasDate) problems.statementDate = "needs_statement_date";
  if (hasDate && !hasBalance && problems.balanceDollars === undefined) problems.balanceDollars = "needs_balance";

  return problems;
}
