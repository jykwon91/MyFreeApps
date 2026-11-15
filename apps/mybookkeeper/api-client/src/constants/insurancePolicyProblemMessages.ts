import type { InsurancePolicyFormProblem } from "../types/insurance/insurance-policy-form-problem";
import { PREMIUM_BILLED_REQUIRED_MESSAGE } from "./insurancePolicyForm";

/** What each form problem says to the person, on the web and on the phone alike. */
export const INSURANCE_POLICY_PROBLEM_MESSAGES: Record<InsurancePolicyFormProblem, string> = {
  name_required: "Give the policy a name.",
  too_long: "That's too long. Shorten it and try again.",
  not_a_number: "Use a plain amount like 1240, or leave it blank.",
  negative: "Enter an amount of zero or more.",
  must_be_positive: "Enter an amount above 0, or leave it blank.",
  billed_required: PREMIUM_BILLED_REQUIRED_MESSAGE,
  wind_hail_out_of_range: "Enter a percentage above 0 and up to 100.",
  wind_hail_decimals: "Use at most two decimal places, like 2.5.",
  dates_order: "The end date is before the start date.",
};
