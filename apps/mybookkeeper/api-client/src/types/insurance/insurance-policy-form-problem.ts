/** What can be wrong with one field of the insurance-policy form, as the server would refuse it. */
export type InsurancePolicyFormProblem =
  | "name_required"
  | "too_long"
  | "not_a_number"
  | "negative"
  | "must_be_positive"
  | "billed_required"
  | "wind_hail_out_of_range"
  | "wind_hail_decimals"
  | "dates_order";
