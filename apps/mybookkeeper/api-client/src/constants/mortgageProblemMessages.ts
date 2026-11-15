import type { MortgageFormProblem } from "../types/mortgage/mortgage-form-problem";

/** What each form problem says to the person, on the web and on the phone alike. */
export const MORTGAGE_PROBLEM_MESSAGES: Record<MortgageFormProblem, string> = {
  rate_type_required: "Pick whether the rate is fixed or adjustable.",
  rate_out_of_range: "Use a rate above 0 and below 25, like 7.125.",
  not_a_number: "Use a plain amount like 1995.82, or leave it blank.",
  must_be_positive: "Use an amount above 0, or leave it blank.",
  term_out_of_range: "Use a number of months from 1 to 600, or leave it blank.",
  needs_statement_date: "A balance is only true as of a date. Pick the statement date too.",
  needs_balance: "Add the balance that statement showed, or clear the date.",
};
