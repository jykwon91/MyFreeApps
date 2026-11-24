/** What is wrong with one field of the holding form. Codes, so web and phone word it their own way. */
export type HoldingFormProblem =
  | "account_required"
  | "ticker_or_name"
  | "ticker_format"
  | "name_too_long"
  | "required"
  | "not_a_number"
  | "must_be_positive"
  | "too_large"
  | "too_many_decimals";
