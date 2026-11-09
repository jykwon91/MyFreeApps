/**
 * What is wrong with one field of the mortgage form, before anything is sent.
 *
 * Codes rather than wording: the web and the phone say it in their own voice.
 */
export type MortgageFormProblem =
  | "rate_type_required"
  | "rate_out_of_range"
  | "not_a_number"
  | "must_be_positive"
  | "term_out_of_range"
  | "needs_statement_date"
  | "needs_balance";
