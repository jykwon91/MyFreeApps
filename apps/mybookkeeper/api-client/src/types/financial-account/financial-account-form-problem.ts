/** What is wrong with one field of the account form. Codes, so web and phone word it their own way. */
export type FinancialAccountFormProblem =
  | "name_required"
  | "type_required"
  | "mask_format"
  | "not_a_number"
  | "needs_balance_date";
